/** `import x from "./a.wav" with { type: "file" }` gives the path of the file. */
declare module "*.wav" {
  const path: string;
  export default path;
}
