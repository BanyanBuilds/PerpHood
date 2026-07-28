import { NextRequest, NextResponse } from "next/server";
import { readV87LiveState } from "@/lib/server/v87-live-state-store";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
  try{
    const q=request.nextUrl.searchParams; const chainId=Number(q.get("chainId") ?? process.env.ROBINHOOD_CHAIN_ID ?? "46630");
    if(!Number.isSafeInteger(chainId)||chainId<=0) return NextResponse.json({ok:false,error:"Invalid chainId."},{status:400});
    const state=readV87LiveState({chainId,marketAddress:q.get("market") ?? undefined,ownerAddress:q.get("owner") ?? undefined,includeClosed:q.get("includeClosed")==="true",limit:Number(q.get("limit") ?? "100")});
    return NextResponse.json({ok:true,...state},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Unable to read live state."},{status:500});}
}
