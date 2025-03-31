export function stripTypeModifiers(type: string) {
  return type.replaceAll("!", "").replaceAll("[", "").replaceAll("]", "");
}

export function stripNonNull(type: string) {
  return type.replace(/\!$/, "");
}

export function stripList(type: string) {
  return type.replace(/^\[/, "").replace(/\]$/, "");
}

export function isNonNull(type: string) {
  return type.endsWith("!");
}

export function isList(type: string) {
  return type.endsWith("]");
}
