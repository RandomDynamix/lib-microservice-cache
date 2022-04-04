import Cache                         from './cache.js';
import hash                          from 'object-hash';
import {v4 as uuidv4}                from 'uuid';

const CACHE_DEFAULT           =    60 * 1000;   //1 Minute in MILLISECONDS
const CACHE_STATIC_ASSETS     = 86400 * 1000;   //1 Day in MILLISECONDS

const PREFIX_AUTHORIZATION    = 'AUTHORIZATION';
const MESH_PREFIX             = 'MESH';

export interface MeshContext {
    correlationUUID: string,
    ephemeralToken:  string
    proxyToken:      string | null
}

export interface SiteMetadata {
    id?:      string | null,
    site_id?: string | null,
    url?:     string | null,
    master?:  boolean
}

export default class MeshAssets {
    cache: any                  = null;
    meshTimeout: number         = parseInt(process.env.MESH_TIMEOUT   ||   '7500');    //7.5 Seconds

    constructor(private microservice: any, private idToken: string) {}

    async init(): Promise<void> {
        if(!this.microservice)  throw 'CACHE INITIALIZATON ERROR: Missing microservice';
        if(!this.idToken)       throw 'CACHE INITIALIZATON ERROR: Missing idToken';

        this.cache = new Cache(this.microservice.emit);
        await this.cache.init();
    }

    async shutdown(): Promise<void> {}


    //*********************************************************
    //*** EXPOSED MESH ASSETS METHODS ***
    //*********************************************************
    getCache(): Cache {
        return this.cache;
    }

    async getMeshContext(proxiedToken?: any): Promise<MeshContext | null> {
        let identityToken: any = null;
        let proxyToken: any    = null;

        let ephemeralToken: any = await this.getEphemeralTokenCache() || await this.queryEphemeralToken();
        if(ephemeralToken) identityToken = ephemeralToken;

        if(!identityToken) return null;

        if(proxiedToken) {
            identityToken = proxiedToken;
            proxyToken = ephemeralToken;
        }

        return {
            correlationUUID: uuidv4(),
            ephemeralToken:  identityToken,
            proxyToken:      proxyToken
        };
    }


    async getSiteConfiguration(site_id: string | null) {
        //This can be requested by site_id or null(Master)
        let siteMeta: SiteMetadata | null = site_id ? { site_id } : null;

        let siteConfiguration: any = await this.getSiteConfigurationCache(siteMeta);
        if(siteConfiguration) return siteConfiguration;

        if(siteMeta?.site_id) siteMeta.id = siteMeta.site_id;
        let site: any = await this.querySite(siteMeta);
        if(site?.jdoc_config) {
            //Optimize for Cache
            let siteConfiguration: any = site.jdoc_config;
            siteConfiguration.id = site.id;
            siteConfiguration.url = site.url;
            siteConfiguration.master = site.master;
            siteConfiguration.notification_email = site.notification_email;
            if(site.public_user?.length === 1) siteConfiguration.public_user = site.public_user[0];

            this.cacheSiteConfiguration(siteConfiguration, CACHE_STATIC_ASSETS);
            return siteConfiguration;
        }
        return null;
    }


    //*********************************************************
    //*** MESH REQUEST METHODS ***
    //*********************************************************
    private async queryEphemeralToken() {
        try{this.microservice.emit('info', 'MICROSERVICE CACHE', `QUERYING Ephemeral Token`);}catch(err){}
        let credentialResult = await this.microservice.query('token.ephemeral.retrieve', { correlationUUID: uuidv4(), idToken: this.idToken }, {}, this.meshTimeout, PREFIX_AUTHORIZATION);
        if(credentialResult) return credentialResult.ephemeralToken;
        return null;
    }

    private async querySite(siteMeta: SiteMetadata | null) {
        try{this.microservice.emit('info', 'MICROSERVICE CACHE', `QUERYING Site (${JSON.stringify(siteMeta)})`);}catch(err){}
        if(!siteMeta) siteMeta = {master: true};
        let result: any = await this.microservice.query('ccti.sites.retrieve', await this.getMeshContext(), {filter: siteMeta}, this.meshTimeout, MESH_PREFIX);
        if(result?.length === 1) return result[0];
        return null;
    }

    //*************************************************************
    //** CACHE MANAGEMENT
    //*************************************************************

    //** EPHEMERAL TOKEN ***************************************
    private async getEphemeralTokenCache(): Promise<any> {
        try {
            let idTokenHash: string = hash(this.idToken);
            let tokenCache: string = await this.cache.get(`token:${idTokenHash}`);
            if(tokenCache) {
                try{this.microservice.emit('info', 'MICROSERVICE CACHE', `FOUND CACHED EphemeralToken`);}catch(err){}
                return JSON.parse(tokenCache);
            }
        } catch(err) {
            try{this.microservice.emit('error', 'MICROSERVICE CACHE', `**CACHE ERROR** getEphemeralTokenCache Error: ${JSON.stringify(err)}`);}catch(err){}
        }
        try{this.microservice.emit('info', 'MICROSERVICE CACHE', `NO CACHE for Ephemeral Token`);}catch(err){}
        return null;
    }

    //** SITE ***********************************************
    private async cacheSiteConfiguration(siteConfiguration: any, expiration: number = CACHE_DEFAULT): Promise<void> {
        try{this.microservice.emit('info', 'MICROSERVICE CACHE', `CACHING SiteConfiguration (${Math.round(expiration / 1000)} s)`);}catch(err){}
        try {
            await this.cache.set(`siteConfiguration:${siteConfiguration.id}`, JSON.stringify(siteConfiguration), expiration);
            await this.cache.set(`siteConfiguration:${siteConfiguration.url}`, JSON.stringify(siteConfiguration), expiration);
            if(siteConfiguration.master) await this.cache.set(`siteConfiguration:master`, JSON.stringify(siteConfiguration), expiration);
        } catch(err) {
            try{this.microservice.emit('error', 'MICROSERVICE CACHE', `**CACHE ERROR** cacheSiteConfiguration Error: ${JSON.stringify(err)}`);}catch(err){}
            //await this.purgeSiteConfigurationCache();
        }
    }
    private async getSiteConfigurationCache(siteMeta: SiteMetadata | null): Promise<any> {
        try {
            let siteConfigurationCache: string | null = null;

            if (!siteMeta)         siteConfigurationCache = await this.cache.get(`siteConfiguration:master`);
            if (siteMeta?.url)     siteConfigurationCache = await this.cache.get(`siteConfiguration:${siteMeta.url}`);
            if (siteMeta?.site_id) siteConfigurationCache = await this.cache.get(`siteConfiguration:${siteMeta.site_id}`);

            if (siteConfigurationCache) {
                try{this.microservice.emit('info', 'MICROSERVICE CACHE', `FOUND CACHED SiteConfiguration`);}catch(err){}
                return JSON.parse(siteConfigurationCache);
            }
        } catch (err) {
            try{this.microservice.emit('error', 'MICROSERVICE CACHE', `**CACHE ERROR** getSiteConfigurationCache Error: ${JSON.stringify(err)}`);}catch(err){}
        }
        try{this.microservice.emit('info', 'MICROSERVICE CACHE', `NO CACHE for SiteConfiguration`);}catch(err){}
        return null;
    }
}
