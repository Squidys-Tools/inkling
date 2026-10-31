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
