from pathlib import Path

ADMIN = Path("src/components/AdminSettings.tsx")
TEST = Path("tests/admin-settings-load-contract.test.ts")

text = ADMIN.read_text(encoding="utf-8")

duplicate_team_fetch = '''
      // Fetch team members
      const teamRes = await authFetch("/api/team");
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        setTeamMembers(teamData.members || []);
      }
'''
if text.count(duplicate_team_fetch) != 1:
    raise SystemExit("expected exactly one duplicate /api/team fetch block")
text = text.replace(duplicate_team_fetch, "", 1)

invite_old = '''      toastSuccess("Invitation sent", `An invite has been sent to ${email}`);
      fetchData();'''
invite_new = '''      toastSuccess("Invitation sent", `An invite has been sent to ${email}`);
      await fetchTeam();'''
if text.count(invite_old) != 1:
    raise SystemExit("expected invite refresh block")
text = text.replace(invite_old, invite_new, 1)

remove_old = '''      toastSuccess("Member removed", "Team access revoked.");
      fetchData();'''
remove_new = '''      toastSuccess("Member removed", "Team access revoked.");
      await fetchTeam();'''
if text.count(remove_old) != 1:
    raise SystemExit("expected member-removal refresh block")
text = text.replace(remove_old, remove_new, 1)

loading_old = '''    } catch (e) {
      clientLog.error("admin-settings:load", e);
      toastError("Settings unavailable", "Could not load settings. Please refresh.");
    }
    setIsLoading(false);
  };'''
loading_new = '''    } catch (e) {
      clientLog.error("admin-settings:load", e);
      toastError("Settings unavailable", "Could not load settings. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  };'''
if text.count(loading_old) != 1:
    raise SystemExit("expected fetchData loading tail")
text = text.replace(loading_old, loading_new, 1)

ADMIN.write_text(text, encoding="utf-8")

TEST.write_text(
    '''import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/AdminSettings.tsx"),
  "utf8",
);

describe("AdminSettings initial-load contract", () => {
  it("loads the team endpoint once on mount", () => {
    const mount = source.slice(
      source.indexOf("useEffect(() =>"),
      source.indexOf("const fetchData = async () =>"),
    );
    const loader = source.slice(
      source.indexOf("const fetchData = async () =>"),
      source.indexOf("const syncCarrierNumbers = async () =>"),
    );

    expect(mount).toContain("fetchTeam();");
    expect(loader).not.toContain('authFetch("/api/team")');
  });

  it("releases the loading state even after an early failed response", () => {
    const loader = source.slice(
      source.indexOf("const fetchData = async () =>"),
      source.indexOf("const syncCarrierNumbers = async () =>"),
    );
    const earlyReturn = loader.indexOf(
      'toastError("Settings unavailable", "Could not load settings. Please refresh.")',
    );
    const finallyBlock = loader.indexOf("} finally {");
    const release = loader.indexOf("setIsLoading(false)", finallyBlock);

    expect(earlyReturn).toBeGreaterThan(-1);
    expect(finallyBlock).toBeGreaterThan(earlyReturn);
    expect(release).toBeGreaterThan(finallyBlock);
  });

  it("refreshes only the team roster after team mutations", () => {
    const invitation = source.slice(
      source.indexOf("const inviteTeamMember"),
      source.indexOf("const removeTeamMember"),
    );
    const removal = source.slice(
      source.indexOf("const removeTeamMember"),
      source.indexOf("const addPhoneNumber"),
    );

    expect(invitation).toContain("await fetchTeam()");
    expect(invitation).not.toContain("fetchData()");
    expect(removal).toContain("await fetchTeam()");
    expect(removal).not.toContain("fetchData()");
  });
});
''',
    encoding="utf-8",
)

print("Applied verified Admin Settings load fix.")
