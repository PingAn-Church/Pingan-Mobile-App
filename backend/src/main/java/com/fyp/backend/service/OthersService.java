package com.fyp.backend.service;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fyp.backend.model.Others;
import com.fyp.backend.repository.OthersRepository;

@Service
public class OthersService {
    @Autowired
    private OthersRepository othersRepository;

    public Others getOthersByName(String name) {
        return othersRepository.findByName(name)
                .orElseThrow(() -> new RuntimeException("Others not found"));
    }

    public List<Others> getAllSections() {
        return othersRepository.findAll();
    }

    public Others updateOthers(String name, String newContent) {
        Others others = getOthersByName(name);
        others.setContent(newContent);
        return othersRepository.save(others);
    }

    public Others createOthers(String name, String content) {
        if (othersRepository.findByName(name).isPresent()) {
            throw new RuntimeException("Section already exists");
        }
        Others newSection = new Others(name, content);
        return othersRepository.save(newSection);
    }

    public void deleteOthers(String name) {
        Others others = getOthersByName(name);
        othersRepository.delete(others);
    }

    public Others renameOthers(String oldName, String newName) {
        Others others = getOthersByName(oldName);
        if (othersRepository.findByName(newName).isPresent()) {
            throw new RuntimeException("New name already exists");
        }
        others.setName(newName);
        return othersRepository.save(others);
    }

}
