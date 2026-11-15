-- 081_flow_create_lead.sql
-- Flow steps may now be 'create_lead' (adds a lead to the Leads page) and 'action' (connected
-- services), which the builder already offered but the database refused to save.
ALTER TABLE flow_nodes DROP CONSTRAINT IF EXISTS flow_nodes_node_type_check;
ALTER TABLE flow_nodes ADD CONSTRAINT flow_nodes_node_type_check CHECK (node_type IN (
  'start', 'send_buttons', 'send_list', 'send_message', 'send_media', 'collect_input',
  'condition', 'set_tag', 'action', 'create_lead', 'handoff', 'http_fetch', 'end'
));
