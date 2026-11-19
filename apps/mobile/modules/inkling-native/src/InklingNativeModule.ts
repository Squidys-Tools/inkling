import { NativeModule, requireNativeModule } from "expo";

export type TailscaleStatus = { state: string; authURL?: string; ips?: string[]; error?: string };

declare class InklingNativeModule extends NativeModule {
  appGroupPath(group: string): string | null;
  startTailscale(hostName: string): Promise<void>;
  textHiddenStates(modelPath: string, ids: number[], typeIds: number[]): Promise<number[]>;
  tailnetGet(
    address: string,
    path: string,
    token: string,
  ): Promise<{ status: number; text: string; base64: string }>;
  tailscaleStatus(): Promise<TailscaleStatus>;
}

export default requireNativeModule<InklingNativeModule>("InklingNative");
