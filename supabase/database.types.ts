export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  app_private: {
    Tables: {
      user_roles: {
        Row: {
          created_at: string;
          role: Database['app_private']['Enums']['app_role'];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          role: Database['app_private']['Enums']['app_role'];
          user_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database['app_private']['Enums']['app_role'];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      app_role: 'narrator' | 'admin';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  player_api: {
    Tables: {
      map_nodes: {
        Row: {
          approximate_radius: number | null;
          confidence: number;
          details: Json;
          geom: unknown;
          kind: string;
          knowledge_state: string;
          label: string;
          owner_user_id: string;
          projection_id: string;
          role: string;
          updated_at: string;
        };
        Insert: {
          approximate_radius?: number | null;
          confidence: number;
          details?: Json;
          geom?: unknown;
          kind: string;
          knowledge_state: string;
          label: string;
          owner_user_id: string;
          projection_id: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          approximate_radius?: number | null;
          confidence?: number;
          details?: Json;
          geom?: unknown;
          kind?: string;
          knowledge_state?: string;
          label?: string;
          owner_user_id?: string;
          projection_id?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      map_routes: {
        Row: {
          details: Json;
          from_projection_id: string;
          geom: unknown;
          knowledge_state: string;
          label: string | null;
          owner_user_id: string;
          projection_id: string;
          to_projection_id: string;
          updated_at: string;
        };
        Insert: {
          details?: Json;
          from_projection_id: string;
          geom?: unknown;
          knowledge_state: string;
          label?: string | null;
          owner_user_id: string;
          projection_id: string;
          to_projection_id: string;
          updated_at?: string;
        };
        Update: {
          details?: Json;
          from_projection_id?: string;
          geom?: unknown;
          knowledge_state?: string;
          label?: string | null;
          owner_user_id?: string;
          projection_id?: string;
          to_projection_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'map_routes_owner_user_id_from_projection_id_fkey';
            columns: ['owner_user_id', 'from_projection_id'];
            isOneToOne: false;
            referencedRelation: 'map_nodes';
            referencedColumns: ['owner_user_id', 'projection_id'];
          },
          {
            foreignKeyName: 'map_routes_owner_user_id_to_projection_id_fkey';
            columns: ['owner_user_id', 'to_projection_id'];
            isOneToOne: false;
            referencedRelation: 'map_nodes';
            referencedColumns: ['owner_user_id', 'projection_id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  server_api: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      commit_location_state_v1: {
        Args: {
          p_action: string;
          p_actor_kind: string;
          p_actor_ref: string;
          p_area_id?: string;
          p_correlation_id: string;
          p_event_id: string;
          p_event_kind: string;
          p_event_payload: Json;
          p_event_schema_version: number;
          p_expected_revision: number;
          p_is_secret?: boolean;
          p_kind?: string;
          p_location_id: string;
          p_name?: string;
          p_occurred_at: string;
          p_payload?: Json;
          p_source: string;
          p_world_id: string;
          p_x?: number;
          p_y?: number;
        };
        Returns: {
          applied: boolean;
          committed_revision: number;
        }[];
      };
      refresh_player_route_projection_v1: {
        Args: { p_owner_user_id: string; p_source_route_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  world_private: {
    Tables: {
      areas: {
        Row: {
          boundary: unknown;
          created_at: string;
          id: string;
          name: string;
          secret_payload: Json;
          sector_id: string | null;
          updated_at: string;
          world_id: string;
        };
        Insert: {
          boundary?: unknown;
          created_at?: string;
          id: string;
          name: string;
          secret_payload?: Json;
          sector_id?: string | null;
          updated_at?: string;
          world_id: string;
        };
        Update: {
          boundary?: unknown;
          created_at?: string;
          id?: string;
          name?: string;
          secret_payload?: Json;
          sector_id?: string | null;
          updated_at?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'areas_sector_id_fkey';
            columns: ['sector_id'];
            isOneToOne: false;
            referencedRelation: 'sectors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'areas_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      locations: {
        Row: {
          area_id: string | null;
          created_at: string;
          geom: unknown;
          id: string;
          is_secret: boolean;
          kind: string;
          name: string;
          payload: Json;
          revision: number;
          secret_payload: Json;
          updated_at: string;
          world_id: string;
        };
        Insert: {
          area_id?: string | null;
          created_at?: string;
          geom: unknown;
          id: string;
          is_secret?: boolean;
          kind: string;
          name: string;
          payload?: Json;
          revision?: number;
          secret_payload?: Json;
          updated_at?: string;
          world_id: string;
        };
        Update: {
          area_id?: string | null;
          created_at?: string;
          geom?: unknown;
          id?: string;
          is_secret?: boolean;
          kind?: string;
          name?: string;
          payload?: Json;
          revision?: number;
          secret_payload?: Json;
          updated_at?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'locations_area_id_fkey';
            columns: ['area_id'];
            isOneToOne: false;
            referencedRelation: 'areas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'locations_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      player_location_knowledge: {
        Row: {
          approximate_geom: unknown;
          approximate_radius: number | null;
          confidence: number;
          learned_at: string;
          origin_kind: string;
          origin_label: string | null;
          owner_user_id: string;
          projection_id: string;
          refreshed_at: string;
          source_location_id: string;
          state: Database['world_private']['Enums']['knowledge_state'];
        };
        Insert: {
          approximate_geom?: unknown;
          approximate_radius?: number | null;
          confidence: number;
          learned_at: string;
          origin_kind: string;
          origin_label?: string | null;
          owner_user_id: string;
          projection_id: string;
          refreshed_at: string;
          source_location_id: string;
          state: Database['world_private']['Enums']['knowledge_state'];
        };
        Update: {
          approximate_geom?: unknown;
          approximate_radius?: number | null;
          confidence?: number;
          learned_at?: string;
          origin_kind?: string;
          origin_label?: string | null;
          owner_user_id?: string;
          projection_id?: string;
          refreshed_at?: string;
          source_location_id?: string;
          state?: Database['world_private']['Enums']['knowledge_state'];
        };
        Relationships: [
          {
            foreignKeyName: 'player_location_knowledge_source_location_id_fkey';
            columns: ['source_location_id'];
            isOneToOne: false;
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
        ];
      };
      player_route_knowledge: {
        Row: {
          confidence: number;
          learned_at: string;
          origin_kind: string;
          origin_label: string | null;
          owner_user_id: string;
          projection_id: string;
          refreshed_at: string;
          source_route_id: string;
          state: Database['world_private']['Enums']['knowledge_state'];
        };
        Insert: {
          confidence: number;
          learned_at: string;
          origin_kind: string;
          origin_label?: string | null;
          owner_user_id: string;
          projection_id: string;
          refreshed_at: string;
          source_route_id: string;
          state: Database['world_private']['Enums']['knowledge_state'];
        };
        Update: {
          confidence?: number;
          learned_at?: string;
          origin_kind?: string;
          origin_label?: string | null;
          owner_user_id?: string;
          projection_id?: string;
          refreshed_at?: string;
          source_route_id?: string;
          state?: Database['world_private']['Enums']['knowledge_state'];
        };
        Relationships: [
          {
            foreignKeyName: 'player_route_knowledge_source_route_id_fkey';
            columns: ['source_route_id'];
            isOneToOne: false;
            referencedRelation: 'routes';
            referencedColumns: ['id'];
          },
        ];
      };
      rings: {
        Row: {
          center: unknown;
          created_at: string;
          id: string;
          inner_radius: number;
          name: string;
          ordinal: number;
          outer_radius: number;
          secret_payload: Json;
          updated_at: string;
          world_id: string;
        };
        Insert: {
          center: unknown;
          created_at?: string;
          id: string;
          inner_radius: number;
          name: string;
          ordinal: number;
          outer_radius: number;
          secret_payload?: Json;
          updated_at?: string;
          world_id: string;
        };
        Update: {
          center?: unknown;
          created_at?: string;
          id?: string;
          inner_radius?: number;
          name?: string;
          ordinal?: number;
          outer_radius?: number;
          secret_payload?: Json;
          updated_at?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rings_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      routes: {
        Row: {
          created_at: string;
          from_location_id: string;
          geom: unknown;
          id: string;
          name: string | null;
          payload: Json;
          revision: number;
          secret_payload: Json;
          to_location_id: string;
          updated_at: string;
          world_id: string;
        };
        Insert: {
          created_at?: string;
          from_location_id: string;
          geom: unknown;
          id: string;
          name?: string | null;
          payload?: Json;
          revision?: number;
          secret_payload?: Json;
          to_location_id: string;
          updated_at?: string;
          world_id: string;
        };
        Update: {
          created_at?: string;
          from_location_id?: string;
          geom?: unknown;
          id?: string;
          name?: string | null;
          payload?: Json;
          revision?: number;
          secret_payload?: Json;
          to_location_id?: string;
          updated_at?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'routes_from_location_id_fkey';
            columns: ['from_location_id'];
            isOneToOne: false;
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'routes_to_location_id_fkey';
            columns: ['to_location_id'];
            isOneToOne: false;
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'routes_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      sectors: {
        Row: {
          boundary: unknown;
          created_at: string;
          id: string;
          name: string;
          ring_id: string;
          secret_payload: Json;
          updated_at: string;
          world_id: string;
        };
        Insert: {
          boundary?: unknown;
          created_at?: string;
          id: string;
          name: string;
          ring_id: string;
          secret_payload?: Json;
          updated_at?: string;
          world_id: string;
        };
        Update: {
          boundary?: unknown;
          created_at?: string;
          id?: string;
          name?: string;
          ring_id?: string;
          secret_payload?: Json;
          updated_at?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sectors_ring_id_fkey';
            columns: ['ring_id'];
            isOneToOne: false;
            referencedRelation: 'rings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sectors_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      world_event_ledger: {
        Row: {
          actor_kind: string;
          actor_ref: string;
          commit_fingerprint: Json;
          correlation_id: string;
          entity_id: string;
          entity_revision: number;
          entity_type: string;
          event_id: string;
          event_kind: string;
          occurred_at: string;
          payload: Json;
          recorded_at: string;
          schema_version: number;
          source: string;
          world_id: string;
        };
        Insert: {
          actor_kind: string;
          actor_ref: string;
          commit_fingerprint: Json;
          correlation_id: string;
          entity_id: string;
          entity_revision: number;
          entity_type: string;
          event_id: string;
          event_kind: string;
          occurred_at: string;
          payload: Json;
          recorded_at?: string;
          schema_version: number;
          source: string;
          world_id: string;
        };
        Update: {
          actor_kind?: string;
          actor_ref?: string;
          commit_fingerprint?: Json;
          correlation_id?: string;
          entity_id?: string;
          entity_revision?: number;
          entity_type?: string;
          event_id?: string;
          event_kind?: string;
          occurred_at?: string;
          payload?: Json;
          recorded_at?: string;
          schema_version?: number;
          source?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'world_event_ledger_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      worlds: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          schema_version: number;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          name: string;
          schema_version: number;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          schema_version?: number;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      knowledge_state:
        'rumor' | 'indication' | 'localized' | 'confirmed' | 'investigated' | 'understood';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  app_private: {
    Enums: {
      app_role: ['narrator', 'admin'],
    },
  },
  player_api: {
    Enums: {},
  },
  server_api: {
    Enums: {},
  },
  world_private: {
    Enums: {
      knowledge_state: [
        'rumor',
        'indication',
        'localized',
        'confirmed',
        'investigated',
        'understood',
      ],
    },
  },
} as const;