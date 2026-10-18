/**
 * The PR-policy check: an AI-assisted submission must name a human owner.
 *
 * This is deliberately a disclosure gate, not an identity check. GitHub cannot
 * prove that a reviewer is human; branch protection and the maintainer's
 * approval are what enforce the human gate. This check makes a missing or
 * empty disclosure fail before a reviewer spends time on the package.
 */

const body = process.env.PR_BODY ?? "";
if (body.trim() === "") {
  console.error("PR body is empty; the submission template is required");
  process.exit(1);
}

const assisted = /^\s*AI-assisted:\s*(yes|no)\s*$/im.exec(body);
if (assisted === null) {
  console.error("PR body must contain a line 'AI-assisted: yes' or 'AI-assisted: no'");
  process.exit(1);
}
if (assisted[1].toLowerCase() === "no") {
  console.log("PR policy: human-authored submission");
  process.exit(0);
}

const owner = /^\s*Human owner:\s*(.+)$/im.exec(body);
const value = owner?.[1]?.trim() ?? "";
if (
  value === "" ||
  /^(none|n\/a|no response)$/i.test(value) ||
  /^_?no response_?$/i.test(value) ||
  /^<.*>$/u.test(value)
) {
  console.error("AI-assisted submissions must name a human owner on a 'Human owner:' line");
  process.exit(1);
}

console.log(`PR policy: AI-assisted submission, human owner recorded as ${value}`);
