/**
 * Extracts the named type from a field type string.
 * Removes list markers ([, ]) and non-null markers (!) to get the base type.
 *
 * Examples:
 * - "String" -> "String"
 * - "String!" -> "String"
 * - "[String!]!" -> "String"
 * - "User" -> "User"
 * - "[User!]" -> "User"
 */
export function extractNamedTypeName(typeStr: string): string | null {
  let typeName = typeStr;

  if (!typeName) {
    return null;
  }

  typeName = typeName.replace(/[![\]]/g, "");

  return typeName || null;
}
