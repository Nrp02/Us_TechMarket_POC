import { readFileSync, writeFileSync } from "node:fs";
const auth = JSON.parse(readFileSync("/Users/nrp/Library/Application Support/com.vercel.cli/auth.json", "utf8"));
const linked = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
const headers = { Authorization: `Bearer ${auth.token}` };
const deploymentResponse = await fetch(`https://api.vercel.com/v13/deployments/dpl_H9uvKdEeAqfnDst9x2YcudWQEYBU`, { headers });
const deployment = await deploymentResponse.json();
if (!deploymentResponse.ok) throw new Error(`Vercel metadata ${deploymentResponse.status}: ${deployment.error?.message}`);
const envResponse = await fetch(`https://api.vercel.com/v9/projects/${deployment.projectId}/env?decrypt=true`, { headers });
const environment = await envResponse.json();
const url = environment.envs?.find((e: { key: string; target?: string[] }) => e.key === "NEXT_PUBLIC_SUPABASE_URL" && e.target?.includes("production"));
const receipt = {
  state: deployment.readyState, url: deployment.url, aliases: deployment.alias,
  projectId: deployment.projectId, linkedProjectId: linked.projectId,
  commit: deployment.meta?.githubCommitSha,
  productionDbUrlType: url?.type,
  productionDbUrlComparable: Boolean(url?.value?.startsWith("https://")),
  productionDbUrlMatchesLocal: url?.value?.startsWith("https://") ? url.value === process.env.NEXT_PUBLIC_SUPABASE_URL : null,
};
writeFileSync(".scratch/narrative-audit/deployment-receipt.json", JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
