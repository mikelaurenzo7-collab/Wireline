/**

 * EmailPage — dedicated email inbox route.

 */

import EmailInbox from "../components/EmailInbox";

import ClientRouteViewport from "../components/layout/ClientRouteViewport";

import HubTabs, { CHANNELS_HUB } from "../components/HubTabs";

export default function EmailPage() {
  return (
    <ClientRouteViewport>
      <HubTabs tabs={CHANNELS_HUB} label="Channels" className="mb-2 md:mb-3" />

      <EmailInbox embedded />
    </ClientRouteViewport>
  );
}
