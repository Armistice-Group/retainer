// Which build a server is running. The version comes from package.json; the
// image workflow (Dockerfile / docker.yml) adds the CI build number for
// untagged builds and the commit, shown on hover.
const PACKAGE_VERSION = process.env.NEXT_PUBLIC_PACKAGE_VERSION || "0.0.0";
const TAG = process.env.NEXT_PUBLIC_APP_VERSION || "";
const BUILD = process.env.NEXT_PUBLIC_APP_BUILD || "";
const REVISION = (process.env.NEXT_PUBLIC_APP_REVISION || "").slice(0, 7);

/** e.g. "v1.2.0" for a release, "v1.2.0 · build 214" for a main build. */
export const APP_VERSION_LABEL = /^v\d/.test(TAG)
  ? TAG
  : `v${PACKAGE_VERSION}${BUILD ? ` · build ${BUILD}` : TAG ? ` · ${TAG}` : " · dev"}`;

export const APP_VERSION_TITLE = REVISION ? `Commit ${REVISION}` : undefined;
