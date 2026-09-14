export type Rank = 'Kandydat' | 'Choirzysta' | 'Ministrant Światła' | 'Ministrant Krzyża' | 'Lektor' | 'Ceremoniarz';
export type AttendanceType = 'single' | 'excused';
export const RANKS: Rank[] = ['Kandydat', 'Choirzysta', 'Ministrant Światła', 'Ministrant Krzyża', 'Lektor', 'Ceremoniarz'];
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
  suggested_spots: number;
  is_extra: boolean;
};

export type RecurringRule = {
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

export type NewMass = Omit<Mass, 'id'>;

export type RecurringMassesInput = {
  title: string;
  suggested_spots: number;
  is_extra: boolean;
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
      admin_login: { Args: { p_pin: string }; Returns: AdminSession[] };
      admin_logout: { Args: { p_token: string }; Returns: undefined };
      admin_update_server: { Args: { p_token: string; p_id: string; p_name: string; p_rank: string }; Returns: undefined };
      admin_update_mass_time: { Args: { p_token: string; p_id: string; p_start_time: string }; Returns: undefined };
      admin_add_mass: { Args: { p_token: string; p_start_time: string; p_title: string; p_suggested_spots: number }; Returns: undefined };
      admin_delete_mass: { Args: { p_token: string; p_id: string }; Returns: undefined };
      admin_add_recurring_masses: {
        Args: {
          p_token: string;
          p_title: string;
          p_suggested_spots: number;
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
  servers: AltarServer[];
  masses: Mass[];
  rules: RecurringRule[];
  exceptions: MassAttendee[];
  attendees: EffectiveAttendee[];
}
