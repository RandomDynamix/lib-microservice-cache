import Cache from './cache.js';
export interface MeshContext {
    correlationUUID: string;
    ephemeralToken: string;
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
    getCache(): Cache;
    getMeshContext(): Promise<MeshContext | null>;
    getSiteConfiguration(site_id: string | null): Promise<any>;
    private queryEphemeralToken;
    private querySite;
    private getEphemeralTokenCache;
    private cacheSiteConfiguration;
    private getSiteConfigurationCache;
}
