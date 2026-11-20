import { NativeModule, requireNativeModule } from "expo";

declare class InklingNativeModule extends NativeModule {
  appGroupPath(group: string): string | null;
  textHiddenStates(modelPath: string, ids: number[], typeIds: number[]): Promise<number[]>;
}

export default requireNativeModule<InklingNativeModule>("InklingNative");
