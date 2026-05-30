/**

 * SmsPage — dedicated SMS threads route.

 */

import SmsThreads from "../components/SmsThreads";
import ClientRouteViewport from "../components/layout/ClientRouteViewport";

export default function SmsPage() {
  return (
    <ClientRouteViewport>
      <SmsThreads embedded />
    </ClientRouteViewport>
  );
}
