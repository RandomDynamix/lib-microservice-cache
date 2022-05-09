import Cache from './cache.js';
import hash from 'object-hash';
import { v4 as uuidv4 } from 'uuid';
const PREFIX_AUTHORIZATION = 'AUTHORIZATION';
const INTERNAL_PREFIX = 'INTERNAL';
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
    async getSiteConfiguration(siteMeta) {
        let site = await this.getSite(siteMeta);
        if (site?.jdoc_config) {
            let siteConfiguration = site.jdoc_config;
            siteConfiguration.id = site.id;
            siteConfiguration.url = site.url;
            siteConfiguration.master = site.master;
            siteConfiguration.notifications = Object.assign(siteConfiguration.notifications, {
                logo: siteConfiguration.theme.logoDesktop.uri,
                logoAlt: siteConfiguration.theme.nameTag,
                color: siteConfiguration.theme.palette.primary.main,
                companyName: siteConfiguration.contacts.corporate.name,
                companyAddress: siteConfiguration.contacts.corporate.address,
                portalName: siteConfiguration.theme.tabTitle,
                routingEmail: siteConfiguration.notifications.routing.administration,
                opsEmail: siteConfiguration.notifications.routing.operations,
                teamName: siteConfiguration.contacts.operations.name,
                supportEmail: siteConfiguration.contacts.operations.email,
                supportPhone: siteConfiguration.contacts.operations.phone
            });
            return siteConfiguration;
        }
        return null;
    }
    async getSite(siteMeta) {
        let cachedSite = await this.getSiteCache(siteMeta);
        if (cachedSite)
            return cachedSite;
        if (siteMeta?.site_id)
            siteMeta.id = siteMeta.site_id;
        return await this.querySite(siteMeta);
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
        let result = await this.microservice.query('ccti.sites.retrieve', await this.getMeshContext(), { filter: siteMeta }, this.meshTimeout, INTERNAL_PREFIX);
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
    async getSiteCache(siteMeta) {
        try {
            let siteCache = null;
            if (!siteMeta)
                siteCache = await this.cache.get(`site:master`);
            if (siteMeta?.url)
                siteCache = await this.cache.get(`site:${siteMeta.url}`);
            if (siteMeta?.site_id)
                siteCache = await this.cache.get(`site:${siteMeta.site_id}`);
            if (siteCache) {
                try {
                    this.microservice.emit('info', 'AUTHORIZATION', `FOUND CACHED Site`);
                }
                catch (err) { }
                return JSON.parse(siteCache);
            }
        }
        catch (err) {
            try {
                this.microservice.emit('error', 'AUTHORIZATION', `**CACHE ERROR** getSiteCache Error: ${JSON.stringify(err)}`);
            }
            catch (err) { }
        }
        try {
            this.microservice.emit('info', 'AUTHORIZATION', `NO CACHE for Site`);
        }
        catch (err) { }
        return null;
    }
}
