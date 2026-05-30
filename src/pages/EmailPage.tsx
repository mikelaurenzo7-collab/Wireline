/**

 * EmailPage — dedicated email inbox route.

 */

import EmailInbox from "../components/EmailInbox";
import ClientRouteViewport from "../components/layout/ClientRouteViewport";

export default function EmailPage() {
  return (
    <ClientRouteViewport>
      <EmailInbox embedded />
    </ClientRouteViewport>
  );
}
