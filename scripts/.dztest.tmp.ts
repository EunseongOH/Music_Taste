import { createAdminClient } from "../src/utils/supabase/admin";
const sb = createAdminClient();
async function main() {
  const { data } = await sb.from("mb_artist").select("aliases").eq("mbid","730182f9-2b25-45cc-857a-054c2bbe8ade").maybeSingle();
  console.log("aliases:", JSON.stringify(data?.aliases));
}
main();
