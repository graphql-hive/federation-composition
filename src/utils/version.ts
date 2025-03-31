import { FederationVersion } from "../specifications/federation.js";

type UnsupportedVersion = "v2.7" | "v2.8";

export function satisfiesVersionRange(
  version: FederationVersion,
  range: `${"<" | ">=" | ">"} ${FederationVersion | UnsupportedVersion}`,
) {
  const [sign, ver] = range.split(" ") as [
    "<" | ">=" | ">",
    FederationVersion | UnsupportedVersion,
  ];
  const versionInRange = parseFloat(ver.replace("v", ""));
  const detectedVersion = parseFloat(version.replace("v", ""));

  if (sign === "<") {
    return detectedVersion < versionInRange;
  }

  if (sign === ">") {
    return detectedVersion > versionInRange;
  }

  return detectedVersion >= versionInRange;
}
