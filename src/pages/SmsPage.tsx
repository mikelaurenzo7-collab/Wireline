/**

 * SmsPage — dedicated SMS threads route.

 */

import SmsThreads from "../components/SmsThreads";

import ClientRouteViewport from "../components/layout/ClientRouteViewport";

import HubTabs, { CHANNELS_HUB } from "../components/HubTabs";

export default function SmsPage() {
  return (
    <ClientRouteViewport>
      <HubTabs tabs={CHANNELS_HUB} label="Channels" className="mb-2 md:mb-3" />

      <SmsThreads embedded />
    </ClientRouteViewport>
  );
}
