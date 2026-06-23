import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  Cloud,
  Settings,
  RefreshCcw,
} from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";

export default function SalesforceIntegrationPage() {
  const [syncing, setSyncing] = useState(false);

  return (
    <WorkspaceShell
      title="Salesforce"
      contentClassName="pt-5"
      action={
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-surface-container-high rounded-full border border-outline-variant flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary"></div>
            <span className="font-label-caps text-label-caps text-on-surface">Connected</span>
          </div>
          <button
            className="px-4 py-2 border border-outline-variant rounded-lg font-body-sm text-body-sm hover:bg-surface-container-lowest transition-colors flex items-center gap-2"
            onClick={() => setSyncing(true)}
          >
            <RefreshCcw size={16} className={syncing ? "animate-spin" : ""} />
            Sync Now
          </button>
        </div>
      }
    >
      <div className="mb-8">
        <p className="font-body-md text-body-md text-on-surface-variant">
          Configure data mapping and interaction synchronization for your agent.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Field Mappings */}
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant bg-surface flex justify-between items-center">
              <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
                <Settings className="text-primary w-5 h-5" />
                Field Mappings
              </h2>
              <button className="text-primary font-body-sm text-body-sm hover:underline flex items-center gap-1">
                <span className="text-[16px]">+</span> Add Mapping
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-12 gap-4 mb-2 px-4 font-label-caps text-label-caps text-on-surface-variant">
                <div className="col-span-5">Wireline Agent Data</div>
                <div className="col-span-2 flex justify-center">Direction</div>
                <div className="col-span-5">Salesforce Field</div>
              </div>
              <div className="space-y-3">
                {/* Mapping Row 1 */}
                <div className="grid grid-cols-12 gap-4 items-center bg-surface p-3 rounded-lg border border-outline-variant hover:bg-surface-container-low transition-colors">
                  <div className="col-span-5">
                    <div className="flex items-center gap-2">
                      <span className="text-outline font-medium text-[14px]">Lead Name</span>
                    </div>
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <ArrowRight className="text-primary w-4 h-4" />
                  </div>
                  <div className="col-span-5">
                    <select className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 font-body-sm text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none">
                      <option>Contact.Name</option>
                      <option>Lead.Name</option>
                    </select>
                  </div>
                </div>
                {/* Mapping Row 2 */}
                <div className="grid grid-cols-12 gap-4 items-center bg-surface p-3 rounded-lg border border-outline-variant hover:bg-surface-container-low transition-colors">
                  <div className="col-span-5">
                    <div className="flex items-center gap-2">
                      <span className="text-outline font-medium text-[14px]">Email Address</span>
                    </div>
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <ArrowLeftRight className="text-primary w-4 h-4" />
                  </div>
                  <div className="col-span-5">
                    <select className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 font-body-sm text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none">
                      <option>Contact.Email</option>
                      <option>Lead.Email</option>
                    </select>
                  </div>
                </div>
                {/* Mapping Row 3 */}
                <div className="grid grid-cols-12 gap-4 items-center bg-surface p-3 rounded-lg border border-outline-variant hover:bg-surface-container-low transition-colors">
                  <div className="col-span-5">
                    <div className="flex items-center gap-2">
                      <span className="text-outline font-medium text-[14px]">Sentiment Score</span>
                    </div>
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <ArrowRight className="text-primary w-4 h-4" />
                  </div>
                  <div className="col-span-5">
                    <select className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 font-body-sm text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none">
                      <option>Custom_Sentiment__c</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Interaction Sync */}
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant bg-surface">
              <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
                <RefreshCcw className="text-primary w-5 h-5" />
                Interaction Sync
              </h2>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-start gap-4">
                <div className="mt-1">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded border-outline-variant text-primary focus:ring-primary h-5 w-5"
                  />
                </div>
                <div>
                  <h3 className="font-body-md text-body-md font-medium text-on-surface">
                    Log Calls as Activities
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Automatically create a Task in Salesforce when a call completes, linking it to
                    the matched Contact or Lead.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="mt-1">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded border-outline-variant text-primary focus:ring-primary h-5 w-5"
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-body-md text-body-md font-medium text-on-surface">
                    Attach Transcripts
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 mb-3">
                    Push the full conversation transcript to the CRM activity record.
                  </p>
                  <div className="bg-surface p-4 rounded border border-outline-variant text-body-sm font-body-sm font-mono text-tertiary-container">
                    [Agent] Hello, calling from Wireline...
                    <br />
                    [Customer] Yes, I was interested in...
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="mt-1">
                  <input
                    type="checkbox"
                    className="rounded border-outline-variant text-primary focus:ring-primary h-5 w-5"
                  />
                </div>
                <div>
                  <h3 className="font-body-md text-body-md font-medium text-on-surface">
                    Attach Audio Recordings
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Include a secure link to the audio recording in the activity description.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Status & Info */}
        <div className="space-y-6">
          {/* Connection Status Card */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-6 relative overflow-hidden">
            {/* Subtle ambient glow */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-2xl"></div>

            <div className="flex items-center gap-4 mb-6 relative z-10">
              <div className="w-12 h-12 bg-[#00a1e0]/10 rounded-lg flex items-center justify-center border border-[#00a1e0]/20">
                <Cloud className="text-[#00a1e0] w-6 h-6" />
              </div>
              <div>
                <h3 className="font-headline-md text-headline-md text-on-surface">Salesforce</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Production Org</p>
              </div>
            </div>

            <div className="space-y-3 relative z-10">
              <div className="flex justify-between items-center py-2 border-b border-outline-variant">
                <span className="font-body-sm text-body-sm text-on-surface-variant">Status</span>
                <span className="font-body-sm text-body-sm font-medium text-primary">Active</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-outline-variant">
                <span className="font-body-sm text-body-sm text-on-surface-variant">Last Sync</span>
                <span className="font-body-sm text-body-sm font-medium">10 mins ago</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="font-body-sm text-body-sm text-on-surface-variant">API Usage</span>
                <span className="font-body-sm text-body-sm font-medium">1,204 / 15,000</span>
              </div>
            </div>

            <button className="mt-6 w-full py-2 border border-outline-variant text-on-surface font-body-sm text-body-sm rounded-lg hover:bg-surface transition-colors cursor-pointer">
              Re-authenticate
            </button>
          </div>

          {/* Sync Log Summary */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-6">
            <h3 className="font-body-md text-body-md font-medium text-on-surface mb-4">
              Recent Activity
            </h3>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <div className="mt-1">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-body-sm text-body-sm text-on-surface">
                    Synced 45 Interactions
                  </p>
                  <p className="font-label-caps text-label-caps text-on-surface-variant mt-1 text-[10px]">
                    Today, 10:42 AM
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-body-sm text-body-sm text-on-surface">Updated Lead Mappings</p>
                  <p className="font-label-caps text-label-caps text-on-surface-variant mt-1 text-[10px]">
                    Yesterday, 4:15 PM
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1">
                  <AlertCircle className="w-4 h-4 text-error" />
                </div>
                <div>
                  <p className="font-body-sm text-body-sm text-on-surface">
                    Failed to sync 1 Interaction
                  </p>
                  <p className="font-body-sm text-body-sm text-error mt-1">
                    Missing required field: Company
                  </p>
                  <p className="font-label-caps text-label-caps text-on-surface-variant mt-1 text-[10px]">
                    Yesterday, 2:30 PM
                  </p>
                </div>
              </li>
            </ul>
            <button className="mt-4 text-primary font-body-sm text-body-sm hover:underline w-full text-left cursor-pointer">
              View full logs
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="mt-8 pt-6 border-t border-outline-variant flex justify-end gap-4 pb-12">
        <Link
          to="/actions"
          className="px-6 py-2 border border-outline-variant rounded-lg font-body-sm text-body-sm hover:bg-surface-container-lowest transition-colors cursor-pointer"
        >
          Cancel
        </Link>
        <button className="px-6 py-2 bg-primary text-on-primary rounded-lg font-body-sm text-body-sm hover:bg-primary/90 transition-colors shadow-[0px_10px_25px_-5px_rgba(69,30,187,0.3)] cursor-pointer">
          Save Changes
        </button>
      </div>
    </WorkspaceShell>
  );
}
