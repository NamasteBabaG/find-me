// Safe metadata only: never print connection strings, tokens or email lists.
import {readFileSync} from "node:fs";
if(process.argv.includes("--inspect-local")) {
 for(const file of [".env",".env.local"]) {
  const fields=Object.fromEntries(readFileSync(file,"utf8").split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf("=");return[l.slice(0,i),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
  let schema=null;try{schema=new URL(fields.DATABASE_URL).searchParams.get("schema")}catch{}
  console.log(JSON.stringify({file,schema,postgres:/^postgres/.test(fields.DATABASE_URL||""),appEnv:fields.APP_ENV,qaPasswordPresent:Boolean(fields.QA_ACCESS_PASSWORD),apiKeyPresent:Boolean(fields.OPENAI_API_KEY)}));
 }
 process.exit(0);
}
const u = new URL(process.env.DATABASE_URL);
const meta = {schema:u.searchParams.get("schema"),appEnv:process.env.APP_ENV,storage:process.env.STORAGE_PROVIDER,
  provider:process.env.GENERATION_PROVIDER,daily:process.env.GENERATION_DAILY_CENTS,enabled:process.env.GENERATION_ENABLED,
  world:process.env.GENERATION_WORLD_CENTS,model:process.env.GENERATION_MODEL||"gpt-image-2 (default)",quality:process.env.GENERATION_QUALITY||"medium (default)",
  qaSecretConfigured:Boolean(process.env.QA_ACCESS_PASSWORD),keyConfigured:Boolean(process.env.OPENAI_API_KEY)};
if(meta.schema!=="qa"||meta.appEnv!=="qa")throw new Error("Refusing non-QA environment");
console.log(JSON.stringify(meta));
