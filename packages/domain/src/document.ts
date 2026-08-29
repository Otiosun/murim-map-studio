import type { EntityId, WorldEntity } from './entities';

export interface WorldDocument {
  schemaVersion: 1;
  rootWorldId: EntityId;
  entities: WorldEntity[];
}
