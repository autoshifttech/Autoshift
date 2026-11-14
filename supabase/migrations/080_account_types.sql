-- 080_account_types.sql
--
-- Two kinds of login: 'business' (customers using the app) and 'admin' (the AutoShift team).
--   profiles.account_type : the person's type. 'admin' exactly when they are in platform_admins
--                           (kept in sync by a trigger; people can't change it themselves).
--   accounts.account_type : 'admin' for an admin's own empty sign-up workspace, so it never shows
--                           as a customer business in lists and reports.
--   auth.users app_metadata.account_type : the same type, visible in Supabase → Authentication.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'business';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_type_check CHECK (account_type IN ('business', 'admin'));
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'business';
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_account_type_check CHECK (account_type IN ('business', 'admin'));

-- The type follows platform_admins: added → admin, removed → business.
CREATE OR REPLACE FUNCTION public.sync_account_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID;
  v_type TEXT;
  v_acct UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN v_uid := OLD.user_id; v_type := 'business';
  ELSE v_uid := NEW.user_id; v_type := 'admin';
  END IF;

  UPDATE public.profiles SET account_type = v_type WHERE user_id = v_uid RETURNING account_id INTO v_acct;
  UPDATE auth.users SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('account_type', v_type) WHERE id = v_uid;

  IF v_acct IS NOT NULL THEN
    IF v_type = 'admin' THEN
      -- Only the admin's own unused workspace: a real business (team, WhatsApp, contacts) stays a business.
      UPDATE public.accounts a SET account_type = 'admin'
       WHERE a.id = v_acct AND a.owner_user_id = v_uid
         AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.account_id = a.id AND p.user_id <> v_uid)
         AND NOT EXISTS (SELECT 1 FROM public.whatsapp_config w WHERE w.account_id = a.id)
         AND NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.account_id = a.id);
    ELSE
      UPDATE public.accounts SET account_type = 'business' WHERE id = v_acct;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
ALTER FUNCTION public.sync_account_type() OWNER TO postgres;
DROP TRIGGER IF EXISTS sync_account_type ON public.platform_admins;
CREATE TRIGGER sync_account_type
  AFTER INSERT OR UPDATE OR DELETE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.sync_account_type();

-- People can't change their own type.
CREATE OR REPLACE FUNCTION public.enforce_profile_account_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.account_type IS DISTINCT FROM OLD.account_type AND current_user = 'authenticated' THEN
    RAISE EXCEPTION 'account_type is set by AutoShift only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.enforce_profile_account_type() OWNER TO postgres;
DROP TRIGGER IF EXISTS enforce_profile_account_type ON public.profiles;
CREATE TRIGGER enforce_profile_account_type
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_account_type();

-- Existing admins.
UPDATE public.platform_admins SET role = role;
