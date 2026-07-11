import type { RewardsState } from "./rewards-types.ts";
const now="2026-07-10T12:00:00.000Z",companyId="hamburgueria-07";
export const initialRewardsState:RewardsState={version:1,companyId,coupons:[
 {id:"cup-1",companyId,code:"BEMVINDO10",description:"10% na primeira compra",type:"percentage",value:10,minimumOrder:30,usageLimit:100,usageCount:18,startsAt:"2026-07-01",expiresAt:"2026-12-31",status:"active",createdAt:now,updatedAt:now},
 {id:"cup-2",companyId,code:"FRETEGRATIS",description:"R$ 6 de desconto",type:"fixed",value:6,minimumOrder:50,usageLimit:50,usageCount:9,startsAt:"2026-07-01",expiresAt:"2026-08-31",status:"active",createdAt:now,updatedAt:now},
 {id:"cup-3",companyId,code:"COMBO15",description:"15% nos combos",type:"percentage",value:15,minimumOrder:60,usageCount:24,startsAt:"2026-06-01",expiresAt:"2026-07-31",status:"inactive",createdAt:now,updatedAt:now}],payments:[],program:{id:"loyalty-1",companyId,name:"Clube 07",mode:"points",pointsPerReal:1,rewardThreshold:500,rewardDescription:"R$ 25 de desconto",status:"active"},accounts:[]};
