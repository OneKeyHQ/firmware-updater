import memoizee from 'memoizee';
// @ts-expect-error
import HardwareSDK from '@onekeyfe/hd-web-sdk/build/onekey-js-sdk.min.js';
import { getSDKVersion } from '@onekeyfe/hd-core';
import type { ConnectSettings, CoreApi } from '@onekeyfe/hd-core';

let initialized = false;

export const getHardwareSDKInstance = memoizee(
  async () =>
    new Promise<CoreApi>(async (resolve, reject) => {
      if (initialized) {
        resolve(HardwareSDK);
        return;
      }
      const settings: Partial<ConnectSettings> = {
        debug: true,
        connectSrc: 'https://jssdk.onekey.so/0.2.2-beta-2/',
      };

      try {
        await HardwareSDK.init(settings);
        console.log(
          'HardwareSDK initialized success, version: ',
          getSDKVersion()
        );
        initialized = true;
        resolve(HardwareSDK);
      } catch (e) {
        reject(e);
      }
    }),
  {
    promise: true,
    max: 1,
  }
);
