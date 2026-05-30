import fs from 'fs';

function fixInsightsView() {
  const path = 'src/components/insights/InsightsView.tsx';
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace('import { cn } from "../lib/utils";', 'import { cn } from "../../lib/utils";');
  content = content.replace('import CsvExportButton from "./CsvExportButton";', 'import CsvExportButton from "../CsvExportButton";');
  content = content.replace('import GoalsView from "./GoalsView";', 'import GoalsView from "../GoalsView";');
  content = content.replace('import PageShell from "./PageShell";', 'import PageShell from "../PageShell";');
  content = content.replace('import WidgetBoundary from "./WidgetBoundary";', 'import WidgetBoundary from "../WidgetBoundary";');
  content = content.replace('import ClientRouteViewport from "./layout/ClientRouteViewport";', 'import ClientRouteViewport from "../layout/ClientRouteViewport";');
  content = content.replace(/from "\.\/insights\//g, 'from "./');
  fs.writeFileSync(path, content);
}

function fixOutboundDialer() {
  const path = 'src/components/outbound/OutboundDialer.tsx';
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace('import Cadences from "./Cadences";', 'import Cadences from "../Cadences";');
  content = content.replace('import { logFetchError } from "../lib/utils";', 'import { logFetchError } from "../../lib/utils";');
  content = content.replace('import { authFetch } from "../lib/api";', 'import { authFetch } from "../../lib/api";');
  content = content.replace('import PageShell, { Panel } from "./PageShell";', 'import PageShell, { Panel } from "../PageShell";');
  content = content.replace('import HubTabs, { CHANNELS_HUB } from "./HubTabs";', 'import HubTabs, { CHANNELS_HUB } from "../HubTabs";');
  content = content.replace('import CsvExportButton from "./CsvExportButton";', 'import CsvExportButton from "../CsvExportButton";');
  content = content.replace('import { useToast } from "../contexts/ToastContext";', 'import { useToast } from "../../contexts/ToastContext";');
  content = content.replace('import ConfirmModal from "./ConfirmModal";', 'import ConfirmModal from "../ConfirmModal";');
  content = content.replace(/from "\.\/outbound\//g, 'from "./');
  fs.writeFileSync(path, content);
}

function fixFleetSettings() {
  const path = 'src/components/fleet-settings/FleetSettings.tsx';
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace('import { authFetch, safeJson } from "../lib/api";', 'import { authFetch, safeJson } from "../../lib/api";');
  content = content.replace('import { AGENTS_CHANGED_EVENT } from "../contexts/AgentsContext";', 'import { AGENTS_CHANGED_EVENT } from "../../contexts/AgentsContext";');
  content = content.replace('import ConfirmModal from "./ConfirmModal";', 'import ConfirmModal from "../ConfirmModal";');
  content = content.replace('import { useToast } from "../contexts/ToastContext";', 'import { useToast } from "../../contexts/ToastContext";');
  content = content.replace('import AgentTemplates from "./AgentTemplates";', 'import AgentTemplates from "../AgentTemplates";');
  content = content.replace('import ClientRouteViewport from "./layout/ClientRouteViewport";', 'import ClientRouteViewport from "../layout/ClientRouteViewport";');
  content = content.replace('import ClientSubTabs from "./layout/ClientSubTabs";', 'import ClientSubTabs from "../layout/ClientSubTabs";');
  content = content.replace('from "../lib/agent-capabilities";', 'from "../../lib/agent-capabilities";');
  content = content.replace(/from "\.\/fleet-settings\//g, 'from "./');
  content = content.replace(/from "\.\/fleet\//g, 'from "../fleet/');
  fs.writeFileSync(path, content);
}

fixInsightsView();
fixOutboundDialer();
fixFleetSettings();
