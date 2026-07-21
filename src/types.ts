export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  governorate?: string | null;
  avatar_path?: string | null;
  profile_completed_at?: string;
  status: 'active' | 'inactive';
  created_at?: string;
}

export interface Operation {
  id: string;
  public_token: string;
  source: string;
  upload_origin: string;
  submitted_by_user_id: string;
  submitted_by_phone: string;
  submitted_by_name: string;
  file_bucket: string;
  file_path: string;
  file_original_name: string;
  file_mime_type: string;
  file_size: number;
  original_file_status: string;
  qr_status: string;
  status: string;
  ai_status: string;
  client_upload_metadata: any;
  created_at: string;
  verified_at?: string;
  verified_by_user_id?: string;
  verification_note?: string;
}

export interface MyOperationItem {
  operation_id: string;
  public_token: string;
  file_original_name: string;
  status: string;
  ai_status: string;
  created_at: string;
  relation_type: 'uploader' | 'verifier' | 'viewer';
}
