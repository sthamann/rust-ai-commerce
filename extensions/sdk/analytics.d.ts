export type Analytics = {event:(name:string,data?:any)=>boolean;consent:(value:boolean)=>void;dispose:()=>void;choice:()=>string|null;enabled:()=>boolean};
export function createAnalytics(options:{shop:string;channel?:string;measurementId:string;storage?:Storage;managedConsent?:boolean}):Analytics;
