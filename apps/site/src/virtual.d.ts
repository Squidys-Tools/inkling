declare module "virtual:latest-release" {
  const release: {
    version: string;
    windows: string | null;
    mac: string | null;
    appImage: string | null;
    deb: string | null;
  } | null;
  export default release;
}

// vite-imagetools imports, as used by src/plains/media.ts.
declare module "*as=srcset" {
  const srcset: string;
  export default srcset;
}
declare module "*as=url" {
  const url: string;
  export default url;
}
