import Cache                         from './cache.js';
import hash                          from 'object-hash';
import {v4 as uuidv4}                from 'uuid';

const PREFIX_AUTHORIZATION    = 'AUTHORIZATION';
const INTERNAL_PREFIX         = 'INTERNAL';

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


    async getSiteConfiguration(siteMeta: SiteMetadata | null) {

        let site: any = await this.getSite(siteMeta);
        if(site?.jdoc_config) {
            let siteConfiguration: any = site.jdoc_config;

            //Optimize Configuration
            siteConfiguration.id = site.id;
            siteConfiguration.url = site.url;
            siteConfiguration.master = site.master;

            if(site.public_user?.length === 1)
                siteConfiguration.public_user = site.public_user[0];

            //Cognito
            siteConfiguration.cognito = null;
            for(let authenticationMethod of siteConfiguration.authentication) {
                if(authenticationMethod.userPool) siteConfiguration.cognito = authenticationMethod;
            }

            //Notifications
            siteConfiguration.notifications = Object.assign(siteConfiguration.notifications, {
                logo: siteConfiguration.theme.logoDesktop.uri,
                logoAlt: siteConfiguration.theme.nameTag,
                color: siteConfiguration.theme.palette.primary.main,
                companyName: siteConfiguration.theme.support.legal.name,
                companyAddress: siteConfiguration.theme.support.legal.address,
                portalName: siteConfiguration.theme.tabTitle,
                routingEmail: siteConfiguration.notifications.routing.administration,
                opsEmail: siteConfiguration.notifications.routing.operations,
                teamName: siteConfiguration.theme.support.operations.name,
                supportEmail: siteConfiguration.theme.support.operations.email,
                supportPhone: siteConfiguration.theme.support.operations.phone
            });

            return siteConfiguration;
        }
        return null;
    }

    async getSite(siteMeta: SiteMetadata | null) {
        let cachedSite: any = await this.getSiteCache(siteMeta);
        if(cachedSite) return cachedSite;

        if(siteMeta?.site_id) siteMeta.id = siteMeta.site_id;
        return await this.querySite(siteMeta);
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
        let result: any = await this.microservice.query('ccti.sites.retrieve', await this.getMeshContext(), {filter: siteMeta}, this.meshTimeout, INTERNAL_PREFIX);
        if(result?.length === 1) return result[0];
        return null;
    }

    //*************************************************************
    //** CACHE MANAGEMENT
    //*************************************************************

    //** EPHEMERAL TOKEN ***************************************
    private async getEphemeralTokenCache(): Promise<string | null> {
        try {
            let idTokenHash: string = hash(this.idToken);
            let tokenCache: string | null = await this.cache.get(`token:${idTokenHash}`);
            if(tokenCache) {
                try{this.microservice.emit('info', 'MICROSERVICE CACHE', `FOUND CACHED EphemeralToken`);}catch(err){}
                return tokenCache;
            }
        } catch(err) {
            try{this.microservice.emit('error', 'MICROSERVICE CACHE', `**CACHE ERROR** getEphemeralTokenCache Error: ${JSON.stringify(err)}`);}catch(err){}
        }
        try{this.microservice.emit('info', 'MICROSERVICE CACHE', `NO CACHE for Ephemeral Token`);}catch(err){}
        return null;
    }

    //** SITE ***********************************************
    private async getSiteCache(siteMeta: SiteMetadata | null): Promise<any> {
        try {
            let siteCache: string | null = null;

            if (!siteMeta)         siteCache = await this.cache.get(`site:master`);
            if (siteMeta?.url)     siteCache = await this.cache.get(`site:${siteMeta.url}`);
            if (siteMeta?.site_id) siteCache = await this.cache.get(`site:${siteMeta.site_id}`);

            if (siteCache) {
                try{this.microservice.emit('info', 'AUTHORIZATION', `FOUND CACHED Site`);}catch(err){}
                return JSON.parse(siteCache);
            }
        } catch (err) {
            try{this.microservice.emit('error', 'AUTHORIZATION', `**CACHE ERROR** getSiteCache Error: ${JSON.stringify(err)}`);}catch(err){}
        }
        try{this.microservice.emit('info', 'AUTHORIZATION', `NO CACHE for Site`);}catch(err){}
        return null;
    }
}
