require('dotenv').config();

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const { notarize } = await import('@electron/notarize');
  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    appBundleId: 'hu.adrian.pclauncher',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLEID,
    appleIdPassword: process.env.APPLEIDPASS,
    teamId: process.env.TEAMID,
  });
};
