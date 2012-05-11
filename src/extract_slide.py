#!/usr/bin/env python
# - * - coding: UTF-8 - * -

excluded_files = {'__MACOSX'}

import os
import shutil
from os import path
from sys import argv
from zipfile import is_zipfile, ZipFile

slide_file = argv[1]
slide_dir = argv[2]

# extract zip file

if not is_zipfile(slide_file):
    print('not a zip file')
    exit(1)

file_ = ZipFile(slide_file, 'r')

# filter file
filelist = file_.namelist()
files_to_extract = (filelist[i]
        for i, fname in enumerate(
            path.normpath(f) for f in filelist)
        if not fname.startswith('/') and
           not fname.startswith('../') and
           not fname == '..')

file_.extractall(slide_dir, files_to_extract)

file_.close()

# check if move needed

while True:
    fileset = set(os.listdir(slide_dir))
    fileset -= excluded_files
    if len(fileset) != 1:
        break

    only_file = path.join(slide_dir, filelist[0])
    if path.isdir(only_file) and not path.islink(only_file):
        parent_dir = path.dirname(slide_dir)
        slide_name = path.basename(slide_dir)
        tmp_dirname = path.join(parent_dir, slide_name + '.tmp')
        os.rename(only_file, tmp_dirname)
        
        shutil.rmtree(slide_dir)
        os.rename(tmp_dirname, slide_dir)

# check if contains index.html

if 'index.html' in fileset:
    print('ok')
    exit(0)
elif 'index.htm' in fileset:
    os.link(path.join(slide_dir, 'index.htm'),
            path.join(slide_dir, 'index.html'))
    print('ok')
    exit(0)
else:
    shutil.rmtree(slide_dir)
    print('index not found')
    exit(2)
