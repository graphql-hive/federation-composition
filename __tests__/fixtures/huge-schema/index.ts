import { readdir, readFile } from "node:fs/promises";
import { DocumentNode, parse } from "graphql";

const __dirname = new URL(".", import.meta.url).pathname;

export async function getSubgraphs() {
  const files = await readdir(`${__dirname}`);
  const subgraphs: Array<{
    name: string;
    typeDefs: DocumentNode;
  }> = [];

  for await (const file of files) {
    if (file.endsWith(".graphql")) {
      const schema = await readFile(`${__dirname}/${file}`, "utf8");
      const parsedSchema = parse(schema, {
        noLocation: true,
      });

      subgraphs.push({
        name: file.replace(".graphql", ""),
        typeDefs: parsedSchema,
      });
    }
  }

  return subgraphs;
}
