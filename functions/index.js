const {setGlobalOptions, logger} = require("firebase-functions");
const {beforeUserSignedIn} = require("firebase-functions/v2/identity");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({maxInstances: 10});

exports.mapPingOneGroups = beforeUserSignedIn(async (event) => {
  const credentialProviderId = event.credential?.providerId || "";
  const providerData = Array.isArray(event.data?.providerData) ?
    event.data.providerData : [];
  const providerIds = providerData.map((provider) => provider.providerId);

  const isPingOneSignIn = credentialProviderId === "oidc.pingone" ||
    providerIds.includes("oidc.pingone");

  if (!isPingOneSignIn) {
    return;
  }

  const rawGroups = event.credential?.claims?.groups;
  const groups = Array.isArray(rawGroups) ?
    rawGroups.map((group) => String(group)).filter(Boolean) : [];

  const hasExistingClaims = event.data?.customClaims &&
    typeof event.data.customClaims === "object";
  const existingClaims = hasExistingClaims ? event.data.customClaims : {};

  const customClaims = {
    ...existingClaims,
    groups,
    shakesAdmin: groups.includes("shakesAdmin"),
  };

  logger.info("Mapped PingOne groups into Firebase custom claims", {
    uid: event.data?.uid,
    providerId: credentialProviderId || providerIds.join(","),
    groupCount: groups.length,
    shakesAdmin: customClaims.shakesAdmin,
  });

  return {customClaims};
});
