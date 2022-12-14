/* eslint-disable class-methods-use-this */
import axios from 'axios';
import {
  SearchDevice,
  Success,
  Unsuccessful,
  UiResponseEvent,
  UI_EVENT,
  UI_REQUEST,
  UI_RESPONSE,
} from '@onekeyfe/hd-core';
import { createDeferred, Deferred } from '@onekeyfe/hd-shared';
import { store } from '@/store';
import {
  setBridgeReleaseMap,
  setBridgeVersion,
  setReleaseMap,
} from '@/store/reducers/runtime';
import {
  setMaxProgress,
  setShowPinAlert,
  setShowButtonAlert,
  setUpdateTip,
  setShowProgressBar,
  setShowErrorAlert,
} from '@/store/reducers/firmware';
import type { BridgeReleaseMap, RemoteConfigResponse } from '@/types';
import { arrayBufferToBuffer } from '@/utils';
import { formatMessage } from '@/locales';
import { getHardwareSDKInstance } from './instance';

let searchPromise: Deferred<void> | null = null;
class ServiceHardware {
  scanMap: Record<string, boolean> = {};

  registeredEvents = false;

  isSearch = false;

  timer: ReturnType<typeof setInterval> | null = null;

  file: File | undefined;

  async getSDKInstance() {
    return getHardwareSDKInstance().then((instance) => {
      if (!this.registeredEvents) {
        instance.on(UI_EVENT, (e) => {
          const { type, payload } = e;
          if (type === UI_REQUEST.REQUEST_PIN) {
            this.sendUiResponse({
              type: UI_RESPONSE.RECEIVE_PIN,
              payload: '@@ONEKEY_INPUT_PIN_IN_DEVICE',
            });
            store.dispatch(setShowPinAlert(true));
          } else if (type === UI_REQUEST.REQUEST_BUTTON) {
            store.dispatch(setShowButtonAlert(true));
          } else if (type === UI_REQUEST.CLOSE_UI_WINDOW) {
            store.dispatch(setShowPinAlert(false));
            store.dispatch(setShowButtonAlert(false));
          } else if (type === UI_REQUEST.FIRMWARE_TIP) {
            const { message = '' } = payload.data ?? {};
            switch (message) {
              case 'AutoRebootToBootloader':
                // 5
                store.dispatch(setMaxProgress(5));
                store.dispatch(
                  setUpdateTip(
                    formatMessage({ id: 'TR_GO_TO_BOOTLOADER' }) ?? ''
                  )
                );
                break;
              case 'GoToBootloaderSuccess':
                // 10
                store.dispatch(setMaxProgress(10));
                store.dispatch(
                  setUpdateTip(
                    formatMessage({ id: 'TR_GO_TO_BOOTLOADER_SUCCESS' }) ?? ''
                  )
                );
                break;
              case 'DownloadFirmware':
                // 15
                store.dispatch(setMaxProgress(15));
                store.dispatch(
                  setUpdateTip(
                    formatMessage({ id: 'TR_DOWNLOAD_FIRMWARE' }) ?? ''
                  )
                );
                break;
              case 'DownloadFirmwareSuccess':
                // 25
                store.dispatch(setMaxProgress(25));
                store.dispatch(
                  setUpdateTip(
                    formatMessage({ id: 'TR_DOWNLOAD_FIRMWARE_SUCCESS' }) ?? ''
                  )
                );
                break;
              case 'ConfirmOnDevice':
                store.dispatch(setShowButtonAlert(true));
                store.dispatch(setUpdateTip(''));
                break;
              case 'FirmwareEraseSuccess':
                // 30
                store.dispatch(setMaxProgress(30));
                store.dispatch(
                  setUpdateTip(formatMessage({ id: 'TR_ERASE_SUCCESS' }) ?? '')
                );
                break;
              default:
                break;
            }
          } else if (type === UI_REQUEST.FIRMWARE_PROGRESS) {
            const progress = store.getState().firmware.progress;
            if (
              progress < 99 &&
              payload.progress >= 0 &&
              payload.progress < 100
            ) {
              // 99
              store.dispatch(setMaxProgress(99));
              store.dispatch(
                setUpdateTip(formatMessage({ id: 'TR_INSTALLING' }) ?? '')
              );
            } else if (payload.progress === 100) {
              // 100
              store.dispatch(setMaxProgress(100));
              store.dispatch(setUpdateTip(''));
            }
          }
        });
      }

      return instance;
    });
  }

  async searchDevices() {
    const hardwareSDK = await this.getSDKInstance();
    return hardwareSDK?.searchDevices();
  }

  async startDeviceScan(
    callback: (searchResponse: Unsuccessful | Success<SearchDevice[]>) => void,
    onSearchStateChange: (state: 'start' | 'stop') => void
  ) {
    const searchDevices = async () => {
      if (searchPromise) {
        await searchPromise.promise;
        console.log('search throttling, await search promise and return');
        return;
      }

      searchPromise = createDeferred();
      onSearchStateChange('start');

      let searchResponse;
      try {
        searchResponse = await this.searchDevices();
      } finally {
        searchPromise?.resolve();
        searchPromise = null;
        console.log('search finished, reset searchPromise');
      }

      callback(searchResponse as any);

      onSearchStateChange('stop');
      return searchResponse;
    };

    this.timer = setInterval(async () => {
      if (!this.isSearch && this.timer) {
        clearInterval(this.timer);
        return;
      }
      await searchDevices();
    }, 3000);

    this.isSearch = true;
    await searchDevices();
  }

  stopScan() {
    this.isSearch = false;
  }

  async getFeatures(connectId: string) {
    const hardwareSDK = await this.getSDKInstance();
    const response = await hardwareSDK?.getFeatures(connectId);

    return response;
  }

  async sendUiResponse(response: UiResponseEvent) {
    return (await this.getSDKInstance()).uiResponse(response);
  }

  async checkBridgeStatus() {
    return new Promise((resolve) => {
      axios
        .post('http://localhost:21320')
        .then((res) => {
          if (res.status === 200) {
            resolve(true);
            store.dispatch(setBridgeVersion(res.data.version ?? ''));
          } else {
            resolve(false);
          }
        })
        .catch((e) => {
          console.log(e);
          resolve(false);
        });
    });
  }

  async getReleaseInfo() {
    const { data } = await axios.get<RemoteConfigResponse>(
      `https://data.onekey.so/config.json?noCache=${new Date().getTime()}`
    );

    const deviceMap = {
      classic: data.classic,
      mini: data.mini,
      touch: data.touch,
      pro: data.pro,
    };
    store.dispatch(setReleaseMap(deviceMap));

    const bridgeMap: BridgeReleaseMap = {
      linux64Deb: {
        value: data.bridge.linux64Deb,
        label: 'Linux 64-bit (deb)',
      },
      linux64Rpm: {
        value: data.bridge.linux64Rpm,
        label: 'Linux 64-bit (rpm)',
      },
      linux32Deb: {
        value: data.bridge.linux32Deb,
        label: 'Linux 32-bit (deb)',
      },
      linux32Rpm: {
        value: data.bridge.linux32Rpm,
        label: 'Linux 32-bit (rpm)',
      },
      mac: { value: data.bridge.mac, label: 'Mac OS X' },
      win: { value: data.bridge.win, label: 'Window' },
    };
    store.dispatch(setBridgeReleaseMap(bridgeMap));
  }

  async firmwareUpdate() {
    const state = store.getState();
    const hardwareSDK = await this.getSDKInstance();
    const { device, releaseMap, selectedUploadType, currentTab } =
      state.runtime;
    const params: any = {};

    // binary params
    if (selectedUploadType === 'binary') {
      params.binary = await this.getFileBuffer();
      params.updateType = currentTab;
    }

    // common params
    if (
      device?.deviceType &&
      (selectedUploadType === 'firmware' || selectedUploadType === 'ble')
    ) {
      const version =
        releaseMap[device.deviceType][selectedUploadType][0].version;
      params.version = version;
      params.updateType = state.runtime.selectedUploadType;
    }

    try {
      store.dispatch(setShowProgressBar(true));
      const response = await hardwareSDK.firmwareUpdateV2(undefined, params);
      if (!response.success) {
        store.dispatch(
          setShowErrorAlert({ type: 'error', message: response.payload.error })
        );
        return;
      }
      store.dispatch(
        setShowErrorAlert({ type: 'success', message: '??????????????????' })
      );
    } catch (e) {
      console.log(e);
      store.dispatch(
        setShowErrorAlert({ type: 'error', message: '??????????????????' })
      );
    }
  }

  async uploadFullResource() {
    const hardwareSDK = await this.getSDKInstance();
    const response = await hardwareSDK.deviceFullyUploadResource('', {});
    return !!response.success;
  }

  setFile(file: File) {
    this.file = file;
  }

  getFileBuffer() {
    return new Promise((resolve, reject) => {
      if (!this.file) {
        reject(new Error('no file'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const fw = arrayBufferToBuffer(reader.result);
        resolve(fw);
      };
      reader.readAsArrayBuffer(this.file);
    });
  }
}

export default ServiceHardware;

const serviceHardware = new ServiceHardware();

export { serviceHardware };
