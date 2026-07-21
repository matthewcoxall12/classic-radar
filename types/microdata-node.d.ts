declare module "microdata-node" {
  const microdata: {
    toJson(html: string, options?: Record<string, unknown>): unknown;
  };
  export default microdata;
}
