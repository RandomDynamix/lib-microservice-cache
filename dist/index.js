import Cache from './cache.js';
import hash from 'object-hash';
import { v4 as uuidv4 } from 'uuid';
const CACHE_DEFAULT = 60 * 1000;
const CACHE_STATIC_ASSETS = 86400 * 1000;
const PREFIX_AUTHORIZATION = 'AUTHORIZATION';
const MESH_PREFIX = 'MESH';
export default class MeshAssets {
    constructor(microservice, idToken) {
        this.microservice = microservice;
        this.idToken = idToken;
        this.cache = null;
        this.meshTimeout = parseInt(process.env.MESH_TIMEOUT || '7500');
    }
    async init() {
        if (!this.microservice)
            throw 'CACHE INITIALIZATON ERROR: Missing microservice';
        if (!this.idToken)
            throw 'CACHE INITIALIZATON ERROR: Missing idToken';
        this.cache = new Cache(this.microservice.emit);
        await this.cache.init();
    }
    async shutdown() { }
    getCache() {
        return this.cache;
    }
    async getMeshContext(proxiedToken) {
        let identityToken = null;
        let proxyToken = null;
        let ephemeralToken = await this.getEphemeralTokenCache() || await this.queryEphemeralToken();
        if (ephemeralToken)
            identityToken = ephemeralToken;
        if (!identityToken)
            return null;
        if (proxiedToken) {
            identityToken = proxiedToken;
            proxyToken = ephemeralToken;
        }
        return {
            correlationUUID: uuidv4(),
            ephemeralToken: identityToken,
            proxyToken: proxyToken
        };
    }
    async getSiteConfiguration(site_id) {
        let siteMeta = site_id ? { site_id } : null;
        let siteConfiguration = await this.getSiteConfigurationCache(siteMeta);
        if (siteConfiguration)
            return siteConfiguration;
        if (siteMeta?.site_id)
            siteMeta.id = siteMeta.site_id;
        let site = await this.querySite(siteMeta);
        if (site?.jdoc_config) {
            let siteConfiguration = site.jdoc_config;
            siteConfiguration.id = site.id;
            siteConfiguration.url = site.url;
            siteConfiguration.master = site.master;
            siteConfiguration.notification_email = site.notification_email;
            if (site.public_user?.length === 1)
                siteConfiguration.public_user = site.public_user[0];
            this.cacheSiteConfiguration(siteConfiguration, CACHE_STATIC_ASSETS);
            return siteConfiguration;
        }
        return null;
    }
    async queryEphemeralToken() {
        try {
            this.microservice.emit('info', 'MICROSERVICE CACHE', `QUERYING Ephemeral Token`);
        }
        catch (err) { }
        let credentialResult = await this.microservice.query('token.ephemeral.retrieve', { correlationUUID: uuidv4(), idToken: this.idToken }, {}, this.meshTimeout, PREFIX_AUTHORIZATION);
        if (credentialResult)
            return credentialResult.ephemeralToken;
        return null;
    }
    async querySite(siteMeta) {
        try {
            this.microservice.emit('info', 'MICROSERVICE CACHE', `QUERYING Site (${JSON.stringify(siteMeta)})`);
        }
        catch (err) { }
        if (!siteMeta)
            siteMeta = { master: true };
        let result = await this.microservice.query('ccti.sites.retrieve', await this.getMeshContext(), { filter: siteMeta }, this.meshTimeout, MESH_PREFIX);
        if (result?.length === 1)
            return result[0];
        return null;
    }
    async getEphemeralTokenCache() {
        try {
            let idTokenHash = hash(this.idToken);
            let tokenCache = await this.cache.get(`token:${idTokenHash}`);
            if (tokenCache) {
                try {
                    this.microservice.emit('info', 'MICROSERVICE CACHE', `FOUND CACHED EphemeralToken`);
                }
                catch (err) { }
                return tokenCache;
            }
        }
        catch (err) {
            try {
                this.microservice.emit('error', 'MICROSERVICE CACHE', `**CACHE ERROR** getEphemeralTokenCache Error: ${JSON.stringify(err)}`);
            }
            catch (err) { }
        }
        try {
            this.microservice.emit('info', 'MICROSERVICE CACHE', `NO CACHE for Ephemeral Token`);
        }
        catch (err) { }
        return null;
    }
    async cacheSiteConfiguration(siteConfiguration, expiration = CACHE_DEFAULT) {
        try {
            this.microservice.emit('info', 'MICROSERVICE CACHE', `CACHING SiteConfiguration (${Math.round(expiration / 1000)} s)`);
        }
        catch (err) { }
        try {
            await this.cache.set(`siteConfiguration:${siteConfiguration.id}`, JSON.stringify(siteConfiguration), expiration);
            await this.cache.set(`siteConfiguration:${siteConfiguration.url}`, JSON.stringify(siteConfiguration), expiration);
            if (siteConfiguration.master)
                await this.cache.set(`siteConfiguration:master`, JSON.stringify(siteConfiguration), expiration);
        }
        catch (err) {
            try {
                this.microservice.emit('error', 'MICROSERVICE CACHE', `**CACHE ERROR** cacheSiteConfiguration Error: ${JSON.stringify(err)}`);
            }
            catch (err) { }
        }
    }
    async getSiteConfigurationCache(siteMeta) {
        try {
            let siteConfigurationCache = null;
            if (!siteMeta)
                siteConfigurationCache = await this.cache.get(`siteConfiguration:master`);
            if (siteMeta?.url)
                siteConfigurationCache = await this.cache.get(`siteConfiguration:${siteMeta.url}`);
            if (siteMeta?.site_id)
                siteConfigurationCache = await this.cache.get(`siteConfiguration:${siteMeta.site_id}`);
            if (siteConfigurationCache) {
                try {
                    this.microservice.emit('info', 'MICROSERVICE CACHE', `FOUND CACHED SiteConfiguration`);
                }
                catch (err) { }
                return JSON.parse(siteConfigurationCache);
            }
        }
        catch (err) {
            try {
                this.microservice.emit('error', 'MICROSERVICE CACHE', `**CACHE ERROR** getSiteConfigurationCache Error: ${JSON.stringify(err)}`);
            }
            catch (err) { }
        }
        try {
            this.microservice.emit('info', 'MICROSERVICE CACHE', `NO CACHE for SiteConfiguration`);
        }
        catch (err) { }
        return null;
    }
}
