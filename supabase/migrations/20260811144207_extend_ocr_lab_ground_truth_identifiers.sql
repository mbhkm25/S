alter table public.ocr_lab_ground_truth add column if not exists expected_sender_identifier text, add column if not exists expected_receiver_identifier text;
