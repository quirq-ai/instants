import type { SeedData } from "@/lib/data";
import type { ActivityInput } from "./types";

export type LogKind = "timeline" | "activity";
export type LogDiagnostic = {
  code: string;
  message: string;
  line?: number;
  log: LogKind;
  blocking: true;
};
export type LogEnvelope = {
  v: 1;
  id: string;
  at: string;
  targetId: string;
};
export type SourceStatus = "ready" | "stale" | "error" | "disconnected";
export type SourceRecord = {
  id: string;
  label: string;
  provider: string;
  readOnly: boolean;
  description?: string;
  status?: SourceStatus;
  updatedAt?: string;
};
export type TimelineRecords = {
  viewer: SeedData["currentUser"];
  person: SeedData["users"][number];
  workspace: SeedData["companies"][number];
  post: SeedData["posts"][number];
  thread: SeedData["messages"][number];
  attention: SeedData["attention"][number];
  explore: SeedData["explore"][number];
  source: SourceRecord;
};
export type SourceState = {
  status: SourceStatus;
  checkpoint?: string;
  message?: string;
};
export type IdentityBinding = {
  sourceId: string;
  nativeId: string;
  recordId: string;
};
export type TimelineEntry = LogEnvelope &
  (
    | {
        type: "record.upsert";
        data: {
          [Kind in keyof TimelineRecords]: {
            kind: Kind;
            value: TimelineRecords[Kind];
          };
        }[keyof TimelineRecords];
      }
    | { type: "record.remove"; data: Record<string, never> }
    | { type: "source.state"; data: SourceState }
    | { type: "identity.bound"; data: IdentityBinding }
  );
export type PrivateActivityInput =
  | { type: "profile.created"; data: { profileId: string } }
  | { type: "item.read"; data: { read?: boolean; revision?: string } }
  | { type: "item.snoozed"; data: { until: string | null } }
  | { type: "draft.updated"; data: { text: string } }
  | { type: "note.added"; data: { text: string } }
  | {
      type: "command.requested";
      data: {
        sourceId: string;
        action: string;
        expectedRevision?: string;
        input?: Record<string, string | number | boolean | null>;
      };
    }
  | {
      type: "command.receipt";
      data: {
        status:
          | "queued"
          | "sending"
          | "accepted"
          | "applied"
          | "failed"
          | "uncertain"
          | "conflict";
        message?: string;
      };
    };
export type ActivityEntry = LogEnvelope &
  (ActivityInput | PrivateActivityInput);
export type TimelineSnapshot = SeedData & {
  sources: SourceRecord[];
  sourceStates: Record<string, SourceState>;
  identityBindings: Record<string, IdentityBinding>;
};
export type ParsedLog<Entry> = {
  entries: Entry[];
  diagnostics: LogDiagnostic[];
};
