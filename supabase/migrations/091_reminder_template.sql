-- Appointments → Booking settings: the business's own approved WhatsApp template for reminders
-- sent after the 24-hour window ({name, language, vars}); NULL = AutoShift's reminder template.
ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS reminder_template JSONB;
