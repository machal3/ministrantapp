export type Rank = 'Kandydat' | 'Ministrant' | 'Lektor' | 'Ceremoniarz' | 'Szafarz';
export type AttendanceType = 'single' | 'excused';
export const RANKS: Rank[] = ['Kandydat', 'Ministrant', 'Lektor', 'Ceremoniarz', 'Szafarz'];
export type AdminSession = { token: string; expires_at: string };

export type AltarServer = {
  id: string;
  name: string;
  rank: Rank;
};

export type Mass = {
  id: string;
  start_time: string;
  title: string;
  suggested_spots: number | null;
  is_extra: boolean;
  category?: 'mass' | 'devotion' | 'other';
  series_id?: string | null;
  celebrant?: string | null;
  liturgy_type?: string | null;
};

export type MassEditScope = 'single' | 'future' | 'future_time' | 'future_day_time';

export type FieldSeriesScope = 'single' | 'series';

export type MassEditInput = {
  title: string;
  time: string;
  suggested_spots: number | null;
  is_extra: boolean;
  category?: 'mass' | 'devotion' | 'other';
  celebrant?: string | null;
  liturgy_type?: string | null;
  scope: MassEditScope;
  /** Okazja: cała seria w wybranym zakresie albo tylko ten termin. */
  liturgy_scope?: FieldSeriesScope;
  /** Celebrans: cała seria w wybranym zakresie albo tylko ten termin. */
  celebrant_scope?: FieldSeriesScope;
};

export type RecurringRule = {
  frequency?: 'weekly' | 'monthly';
  interval_weeks?: number;
  month_weeks?: number[];
  start_date?: string | null;
  end_date?: string | null;
  id: string;
  server_id: string;
  day_of_week: number;
  time_slot: string;
};

export type MassAttendee = {
  id: string;
  mass_id: string;
  server_id: string;
  type: AttendanceType;
};

export type EffectiveAttendee = {
  mass_id: string;
  server_id: string;
  name: string;
  rank: Rank;
  attendance_type: 'recurring' | 'single';
};

export type ServiceConfirmation = { mass_id: string; server_id: string; attended: boolean; confirmed_at: string };
export type CompetitionState = { season: string; reset_at: string | null; reset_revision: number; revision: number };
export type PointAdjustment = { id: string; season: string; server_id: string; delta: number; mode: 'add' | 'subtract' | 'set'; reason: string; created_at: string; revision: number };
export type PendingConfirmations = { masses: Mass[]; total: number };

export type NewMass = Omit<Mass, 'id'>;

export type RecurringMassesInput = {
  frequency?: 'weekly' | 'monthly';
  interval_weeks?: number;
  interval_months?: number;
  month_weeks?: number[];
  title: string;
  suggested_spots: number | null;
  is_extra: boolean;
  category?: 'mass' | 'devotion' | 'other';
  celebrant?: string | null;
  liturgy_type?: string | null;
  days: number[];
  time: string;
  start_date: string;
  end_date: string;
};

type Relation<Name extends string, Column extends string, Table extends string> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Table;
  referencedColumns: ['id'];
};

export type Database = {
  public: {
    Tables: {
      service_confirmations: { Row: ServiceConfirmation; Insert: ServiceConfirmation; Update: Partial<ServiceConfirmation>; Relationships: [] };
      competition_seasons: { Row: CompetitionState; Insert: CompetitionState; Update: Partial<CompetitionState>; Relationships: [] };
      point_adjustments: { Row: PointAdjustment; Insert: PointAdjustment; Update: Partial<PointAdjustment>; Relationships: [] };
      day_annotations: { Row: { day: string; label: string }; Insert: {day:string;label:string}; Update: {label?:string}; Relationships: [] };
      altar_servers: {
        Row: AltarServer;
        Insert: Omit<AltarServer, 'id'> & { id?: string };
        Update: Partial<AltarServer>;
        Relationships: [];
      };
      masses: {
        Row: Mass;
        Insert: Pick<Mass, 'start_time'> & Partial<Omit<Mass, 'start_time'>>;
        Update: Partial<Mass>;
        Relationships: [];
      };
      recurring_rules: {
        Row: RecurringRule;
        Insert: Omit<RecurringRule, 'id'> & { id?: string };
        Update: Partial<RecurringRule>;
        Relationships: [Relation<'recurring_rules_server_id_fkey', 'server_id', 'altar_servers'>];
      };
      mass_attendees: {
        Row: MassAttendee;
        Insert: Omit<MassAttendee, 'id'> & { id?: string };
        Update: Partial<MassAttendee>;
        Relationships: [
          Relation<'mass_attendees_mass_id_fkey', 'mass_id', 'masses'>,
          Relation<'mass_attendees_server_id_fkey', 'server_id', 'altar_servers'>,
        ];
      };
    };
    Views: {
      effective_attendees: {
        Row: EffectiveAttendee;
        Relationships: [];
      };
    };
    Functions: {
      pending_service_confirmations: { Args: { p_server_id: string }; Returns: PendingConfirmations };
      confirm_service: { Args: { p_server_id: string; p_mass_id: string; p_attended: boolean }; Returns: undefined };
      admin_adjust_points: { Args: { p_token: string; p_server_id: string; p_season: string; p_mode: string; p_value: number; p_current_points: number; p_revision: number; p_reason: string }; Returns: undefined };
      admin_reset_points: { Args: { p_token: string; p_season: string; p_revision: number }; Returns: undefined };
      admin_set_day_annotation: { Args: {p_token:string;p_day:string;p_label:string}; Returns: undefined };
      admin_login: { Args: { p_pin: string }; Returns: AdminSession[] };
      admin_logout: { Args: { p_token: string }; Returns: undefined };
      admin_add_server: { Args: { p_token: string; p_name: string; p_rank: string }; Returns: string };
      admin_update_server: { Args: { p_token: string; p_id: string; p_name: string; p_rank: string }; Returns: undefined };
      admin_delete_server: { Args: { p_token: string; p_id: string }; Returns: undefined };
      admin_update_mass_time: { Args: { p_token: string; p_id: string; p_start_time: string }; Returns: undefined };
      admin_update_event: { Args: { p_token: string; p_id: string; p_scope: string; p_title: string; p_time: string; p_suggested_spots: number | null; p_is_extra: boolean; p_category: string; p_celebrant?: string | null; p_liturgy_type?: string | null; p_liturgy_scope?: string | null; p_celebrant_scope?: string | null }; Returns: number };
      admin_update_mass: {
        Args: {
          p_token: string;
          p_id: string;
          p_scope: string;
          p_title: string;
          p_time: string;
          p_suggested_spots: number | null;
          p_is_extra: boolean;
        };
        Returns: number;
      };
      admin_add_event: { Args: { p_token: string; p_start_time: string; p_title: string; p_suggested_spots: number | null; p_category: string }; Returns: undefined };
      admin_add_mass: { Args: { p_token: string; p_start_time: string; p_title: string; p_suggested_spots: number | null }; Returns: undefined };
      admin_delete_mass: { Args: { p_token: string; p_id: string }; Returns: undefined };
      admin_add_pattern_events: { Args: { p_token: string; p_title: string; p_suggested_spots: number | null; p_is_extra: boolean; p_category: string; p_days: number[]; p_time: string; p_start_date: string; p_end_date: string; p_frequency: string; p_interval_weeks: number; p_interval_months: number; p_month_weeks: number[] }; Returns: number };
      admin_add_pattern_masses: {
        Args: { p_token: string; p_title: string; p_suggested_spots: number | null; p_is_extra: boolean; p_days: number[]; p_time: string; p_start_date: string; p_end_date: string; p_frequency: string; p_interval_weeks: number; p_interval_months: number; p_month_weeks: number[] };
        Returns: number;
      };
      admin_add_recurring_masses: {
        Args: {
          p_token: string;
          p_title: string;
          p_suggested_spots: number | null;
          p_is_extra: boolean;
          p_days: number[];
          p_time: string;
          p_start_date: string;
          p_end_date: string;
        };
        Returns: number;
      };
      admin_delete_future_masses: { Args: { p_token: string; p_id: string }; Returns: number };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export interface ScheduleData {
  confirmations?: ServiceConfirmation[];
  pointAdjustments?: PointAdjustment[];
  competitionState?: CompetitionState;
  dayAnnotations?: {day:string;label:string}[];
  servers: AltarServer[];
  masses: Mass[];
  rules: RecurringRule[];
  exceptions: MassAttendee[];
  attendees: EffectiveAttendee[];
  recentAttendance?: Record<string, number>;
}
