export interface MeshContext {
    correlationUUID: string;
    ephemeralToken: string;
    proxyToken: string | null;
}
export interface SiteMetadata {
    id?: string | null;
    site_id?: string | null;
    url?: string | null;
    master?: boolean;
}
export default class MeshAssets {
    private microservice;
    private idToken;
    cache: any;
    meshTimeout: number;
    constructor(microservice: any, idToken: string);
    init(): Promise<void>;
    shutdown(): Promise<void>;
    getMeshContext(proxiedToken?: any): Promise<MeshContext | null>;
    getSiteConfiguration(siteMeta: SiteMetadata | null): Promise<any>;
    getSite(siteMeta: SiteMetadata | null): Promise<any>;
    private queryEphemeralToken;
    private querySite;
    private getEphemeralTokenCache;
    private getSiteCache;
}
