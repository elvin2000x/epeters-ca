# Molecule stories (data only)

One file per molecule, `<id>.json`, where `<id>` is the molecule id in `../molecules.json`. Story text lives here and never in code. `sources.json` lists every source a sentence can cite. Check everything with:

```
python tools/check_stories.py
```

It must print `PASS` before a story ships. The checker covers the schema, that every source id exists, that every focus and highlight exists in the local `.cif`, that every link id exists, that `size.nm` matches the file, and that there are no em or en dashes.

## Sentence

Every piece of text is a list of sentences, and each sentence is `{"t": "text", "s": ["source-id", ...]}` with at least one id from `sources.json`.

## Story file

```
{
 "id": "hemoglobin",            molecule id (same as the file name)
 "structure": "4HHB",           PDB id or CCD code of the local file (molecules.json "code")
 "tour": [ stop, ... ],         4 to 6 stops, played in order
 "sections": { ... },
 "highlights": [ ... ],
 "review": "pending"            pending | approved | changes (set by the science reviewer)
}
```

### Tour stop

```
{"id": "heme", "title": "A heme in every chain", "focus": {...}, "view": "cartoon|surface|ball-and-stick|spacefill",
 "text": [sentence, sentence]}          1 or 2 sentences
```

Focus for a PDB structure (selectors use the file's author numbering):

```
{"chains": ["A"],                       auth_asym_id values
 "residues": [[87, 87]] or null,        auth_seq_id ranges, inclusive
 "ligands": ["HEM"] or null,            label_comp_id codes of ligands or ions in those chains
 "whole": true|false}                   true = keep the whole molecule in view, false = zoom to the selection
```

Extension: a residue range may carry a third item, the chain it applies to, for example `[7, 7, "B"]`. Without it, the range applies to every chain in `chains`. Insulin, collagen and DNA use this so a stop can light up different residue numbers on different chains (for example the insulin disulfides A6, A7, A11, A20, B7, B19).

Modified amino acids that the file stores as HETATM inside the chain (hydroxyproline HYP in 1CAG, the GFP chromophore CRO in 1EMA, selenomethionine MSE) can be picked either by residue number or by code in `ligands`.

Focus for a small molecule (water, glucose, ATP, glycine, palmitic acid, cholesterol), using the CCD atom names in the local file:

```
{"atoms": ["O", "H1", "H2"]}
```

### Sections

```
"sections": {
 "does":  [sentences],                               what it does
 "shape": [sentences],                               how the shape does the job
 "lives": {"text": [sentences],
           "links": [{"type": "cell|part|element|molecule|process", "id": "..."}]},
 "wrong": [sentences],                               optional: disease or failure, only when well sourced
 "history": {"year": 1984, "who": "G. Fermi, M.F. Perutz, ...", "method": "X-ray|NMR|cryo-EM",
             "resolution_A": 1.74, "text": [sentences]},
 "size": {"nm": 7.0, "compare": [sentences]}
}
```

- Link ids: `cell`, `part`, `element` and `molecule` resolve in `web/data/links.json` (cells, parts, elements, molecules); `process` resolves in `web/processes/processes.json`.
- `history` is required for PDB structures and left out for the six small molecules. Their models are ideal coordinates from the PDB Chemical Component Dictionary, not an experiment, so there is no year, method or resolution to report.
- `history.year` is the year of the entry's primary citation, `who` lists the authors as they appear in that citation (initials, never guessed first names), and `resolution_A` comes from the RCSB entry.
- `wrong` is left out where no well-sourced disease or failure exists (lysozyme, myosin, GFP, ATP synthase, water, ATP).
- `size.nm` is the longest atom-to-atom distance in the local file, measured by `tools/story_measure.py` (waters skipped; CCD files use ideal coordinates), rounded to one decimal place (two for water). It measures only what the file holds. For example, 1MAB is just one alpha, one beta and the gamma chain of the F1 head, and 1B7T is the myosin head without its tail. The checker fails if the number drifts more than 0.1 nm from the file.

### Highlights

Labelled spots the viewer can mark or list.

```
PDB:   {"chain": "B", "residue": 6, "comp": "GLU", "label": "Sickle cell site (Glu6)", "text": [sentences]}
small: {"atoms": ["O1"], "label": "OH group", "text": [sentences]}
```

`comp` is optional. When present, the checker confirms that the residue at that position in the file really is that amino acid, nucleotide or ligand.

## Notes for the viewer builder

- Hemoglobin 4HHB: chains A and C are alpha, B and D are beta. The sickle cell site is beta Glu6 (B6 and D6). The heme irons are held by His87 (alpha) and His92 (beta).
- ATP synthase 1MAB holds the F1 head only (chain A alpha, B beta, G gamma). Its biological assembly is 3 alpha, 3 beta and 1 gamma, and the F0 membrane motor is not in the file. The tour says so.
- Actin is `web/data/1J6Z.cif`. All other structures are in `web/molecules/data/`.
- Myosin 1B7T: chain A is the heavy chain, Y the regulatory light chain, Z the essential light chain.

## Research helpers (tools/)

`story_cif.py` (reads chains, residues, ligands and atoms), `story_cif_facts.py` (entities, organism, bonds, sequence), `story_measure.py` (size), `story_entry_facts.py` (RCSB Data API facts), `story_uniprot.py` (UniProt features), `story_fetch.py` (saves a page's text so facts can be checked before citing). None of them downloads structure files.
