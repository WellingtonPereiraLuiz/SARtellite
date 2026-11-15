/// <reference types="vite/client" />
declare module '*.pbf?inline' {
  const dataUri: string;
  export default dataUri;
}
