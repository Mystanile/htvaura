// expo-notifications adds the aps-environment entitlement on prebuild. A free Apple Personal Team cannot sign
// with it, and we only use local notifications, so take it out again.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = config => withEntitlementsPlist(config, c => {
  delete c.modResults['aps-environment'];
  return c;
});
