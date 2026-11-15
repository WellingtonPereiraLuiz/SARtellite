#!/usr/bin/env python3
"""Mostra estrutura, dimensões e amostras de metadados GCOV sem carregar o HDF5 inteiro.
Exemplo: python ferramentas/inspecionar_nisar_gcov.py '/caminho/arquivo.h5'
Requer: pip install h5py numpy
O script não calcula mudança, não valida cobertura geográfica e não classifica floresta.
"""
import sys
import json
from pathlib import Path


def stringify(x):
    try:
        return x.decode('utf-8') if isinstance(x,bytes) else str(x)
    except Exception:
        return repr(x)


def inspect(path):
    import h5py
    p=Path(path)
    if not p.is_file():
        raise FileNotFoundError(str(p))
    print('Ficheiro:', p.name, '| tamanho:', p.stat().st_size, 'bytes')
    with h5py.File(p, 'r') as f:
        gpath='/science/LSAR/GCOV/grids/frequencyA'
        print('HDF5 keys raiz:', list(f.keys()))
        if gpath not in f:
            print('ERRO: grupo esperado não encontrado. Inspecione a árvore abaixo.')
        else:
            g=f[gpath]
            print('Grupo:',gpath)
            for key in g.keys():
                obj=g[key]
                if isinstance(obj,h5py.Dataset):
                    print(' -',key,'dataset',obj.shape,str(obj.dtype))
                else:
                    print(' -',key,'group')
            for field in ['HHHH','HVHV','xCoordinates','yCoordinates','projection','mask','numberOfLooks']:
                if field in g:
                    o=g[field]
                    if isinstance(o,h5py.Dataset):
                        print(' *',field,'shape',o.shape,'attrs', {k:stringify(v)[:120] for k,v in o.attrs.items()})
                        if o.ndim == 1 and o.size > 1 and field in ('xCoordinates','yCoordinates'):
                            print('   coordinate first/last:',float(o[0]),float(o[-1]))
                        elif o.size == 1:
                            print('   scalar:',stringify(o[()])[:300])
        print('Metadata groups (depth up to 3, max 80):')
        c=[0]
        def show(name,obj):
            if c[0] >= 80: return
            if name.count('/')<=3:
                print('  /'+name + (' (group)' if isinstance(obj,h5py.Group) else ' (dataset)'))
                c[0]+=1
        f.visititems(show)
    print('ATENÇÃO: este utilitário só INSPECIONA. Não confirma aquisição, geografia ou classificação.')


if __name__=='__main__':
    if len(sys.argv)!=2:
        print('Uso: python ferramentas/inspecionar_nisar_gcov.py /caminho/arquivo.h5')
        sys.exit(2)
    inspect(sys.argv[1])
