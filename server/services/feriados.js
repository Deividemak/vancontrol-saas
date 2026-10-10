// Feriados nacionais do Brasil (fixos + móveis baseados na Páscoa).
// Carnaval e Corpus Christi são pontos facultativos, mas as escolas costumam não ter aula.

function pascoa(ano) {
    // Algoritmo de Meeus/Jones/Butcher
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(ano, mes - 1, dia));
}

const iso = (d) => d.toISOString().slice(0, 10);
const somarDias = (d, n) => new Date(d.getTime() + n * 86400000);

export function feriadosNacionais(ano) {
    const p = pascoa(ano);
    const fixos = [
        ['01-01', 'Confraternização Universal'],
        ['04-21', 'Tiradentes'],
        ['05-01', 'Dia do Trabalho'],
        ['09-07', 'Independência do Brasil'],
        ['10-12', 'Nossa Senhora Aparecida'],
        ['11-02', 'Finados'],
        ['11-15', 'Proclamação da República'],
        ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
        ['12-25', 'Natal'],
    ].map(([md, nome]) => ({ data: `${ano}-${md}`, descricao: nome }));

    const moveis = [
        { data: iso(somarDias(p, -48)), descricao: 'Carnaval (segunda-feira)' },
        { data: iso(somarDias(p, -47)), descricao: 'Carnaval (terça-feira)' },
        { data: iso(somarDias(p, -2)), descricao: 'Sexta-feira Santa' },
        { data: iso(somarDias(p, 60)), descricao: 'Corpus Christi' },
    ];
    return [...fixos, ...moveis].sort((a, b) => a.data.localeCompare(b.data));
}
