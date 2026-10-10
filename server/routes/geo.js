import { Router } from 'express';
import { HttpError } from '../lib/http.js';
import { buscarCep, geocodificar, soDigitos } from '../services/geocoding.js';

const router = Router();

const wrap = (fn, msg) => async (req, res) => {
    try { await fn(req, res); } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        console.error(`[geo] ${msg}:`, err.message);
        res.status(502).json({ error: msg });
    }
};

router.get('/cep/:cep', wrap(async (req, res) => {
    if (soDigitos(req.params.cep).length !== 8) throw new HttpError(400, 'CEP deve ter 8 dígitos.');
    const r = await buscarCep(req.params.cep);
    if (!r) throw new HttpError(404, 'CEP não encontrado.');
    res.json(r);
}, 'Serviço de CEP indisponível no momento.'));

router.post('/geocode', wrap(async (req, res) => {
    const b = req.body || {};
    const e = { cep: b.cep, logradouro: b.logradouro, numero: b.numero, bairro: b.bairro, cidade: b.cidade, uf: b.uf };
    if (!e.logradouro && !e.cep) throw new HttpError(400, 'Informe ao menos o CEP ou a rua.');
    const r = await geocodificar(e);
    if (!r) throw new HttpError(404, 'Endereço não localizado. Ajuste o endereço ou marque o ponto direto no mapa.');
    res.json(r);
}, 'Serviço de localização indisponível no momento. Marque o ponto direto no mapa.'));

export default router;
