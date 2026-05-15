// Wire protocol between the main-thread `Sandbox` and the Worker shell.
// Lives in a tiny standalone module so both sides can import it without
// dragging in either side's runtime dependencies.

import type { SceneDescription } from "./SceneDescription";

export interface InitMessage {
  readonly type: "init";
  readonly source: string;
}

export interface FrameRequestMessage {
  readonly type: "frame";
  readonly requestId: number;
  readonly t: number;
  readonly params: Record<string, unknown>;
}

export type WorkerInboundMessage = InitMessage | FrameRequestMessage;

export interface InitOkMessage {
  readonly type: "init-ok";
}

export interface InitErrorMessage {
  readonly type: "init-error";
  readonly error: string;
}

export interface FrameResultMessage {
  readonly type: "frame-result";
  readonly requestId: number;
  readonly scene: SceneDescription;
}

export interface FrameErrorMessage {
  readonly type: "frame-error";
  readonly requestId: number;
  readonly error: string;
}

export type WorkerOutboundMessage =
  | InitOkMessage
  | InitErrorMessage
  | FrameResultMessage
  | FrameErrorMessage;
