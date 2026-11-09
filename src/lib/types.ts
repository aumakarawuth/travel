import type { TripRole } from "./permissions";

export const TRIP_COLUMNS =
  "id,name,description,start_location_name,start_lat,start_lng,end_location_name,end_lat,end_lng,start_date,end_date,day_count,budget_total,currency,expected_member_count,travel_mode,daily_start_time,daily_end_time,invite_enabled,created_by,archived_at,created_at,updated_at";

export interface Trip {
  id: string; name: string; description: string | null;
  start_location_name: string | null; start_lat: number | null; start_lng: number | null;
  end_location_name: string | null; end_lat: number | null; end_lng: number | null;
  start_date: string; end_date: string; day_count: number;
  budget_total: number | null; currency: string; expected_member_count: number;
  travel_mode: "car" | "motorbike" | "public_transit" | "walking" | "bicycle" | "mixed";
  daily_start_time: string; daily_end_time: string; invite_enabled: boolean;
  created_by: string; archived_at: string | null; created_at: string; updated_at: string;
}

export interface Profile { id: string; display_name: string; avatar_url: string | null; color: string; locale: "th" | "en" }

export interface MemberRow {
  trip_id: string; user_id: string; role: TripRole; color: string | null; joined_at: string;
  profile: Profile | null;
}
