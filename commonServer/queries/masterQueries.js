exports.getMenuByUserQueryParamObj = function (emp_id) {
    let q = `SELECT 
distinct
 mmp.module_id,mm.module_name,mm.order_no AS module_order_no,
 mmp.menu_Id,m.menu_name, m.order_no AS menu_order_no,
  mmp.page_id, mp.page_name,  mp.order_no AS page_order_no
FROM employee_designation_mapping edm
 INNER JOIN map_post_designation mpd ON mpd.designation_id = edm.designation_id
 INNER JOIN master_designation mt ON mt.designation_id = edm.designation_id
 INNER JOIN map_post_group mpg ON mpg.post_id = mpd.post_id
	INNER JOIN map_page_group mapg ON mapg.group_id = mpg.group_id
	INNER JOIN map_module_menu_page mmp ON mmp.page_id = mapg.page_id
	INNER JOIN master_module mm ON mm.module_id = mmp.module_id
 INNER JOIN master_page mp ON mp.page_id = mmp.page_id
 INNER JOIN master_menu m ON m.menu_id = mmp.menu_Id
WHERE edm.emp_id = ? ;`;
    return ({ query: q, params: [emp_id] });
};

exports.getAllDistrictQueryParamObj = function () {
    let q = `SELECT cast(d.District_ID as signed) as district_id ,d.District_Name, d.District_Name_Eng,d.LGD_Code FROM mas_districts d
ORDER BY d.District_Name_Eng`;
    return ({ query: q, params: [] });
};

exports.getVillageListBySubdistrict = function (subdistrict_code) {
    let q = `SELECT d.villcdname, d.vsr_census, d.halka FROM mas_villages d
    WHERE d.subdistrictcode_census = ?
    ORDER BY d.villcdname`
    return ({ query: q, params: [subdistrict_code] });
}

exports.getTehsilByDistrictQueryParamObj = function (district_id) {
    let q = `SELECT t.Tehsil_ID AS tehsil_id, t.Tehsil_Name AS tehsil_name, t.Tehsil_Name_En AS tehsil_name_en,
                t.CensusCode AS census_code
                FROM mas_tehsil t
                WHERE t.District_ID = ?;`
    return ({ query: q, params: [district_id] });
};

exports.getVillageByDistrictAndTehsilQueryParamObj = function (district_id, tehsil_id) {
    let q = `SELECT d.vsr_census, d.villcdname, d.VillageID, d.VillType, d.halka, d.halkanm, d.cdname,
    d.tehcdname, d.rino FROM mas_villages d
INNER JOIN mas_tehsil mt
ON mt.Rev_teh_id = d.tehsilno AND mt.Rev_dist_id = d.distno
WHERE mt.District_ID = ? AND mt.Tehsil_ID = ? 
ORDER BY d.villcdname;`
    return ({ query: q, params: [district_id, tehsil_id] });
};

exports.getMasCasteQueryParamObj = function () {
    let q = `SELECT DISTINCT c.caste_code, c.caste_name FROM mas_caste c
ORDER BY c.caste_code desc ;`;
    return ({ query: q, params: [] });
}

exports.getMasSubCasteQueryParamObj = function (caste_code) {
    let q = `SELECT c.subcaste_code, c.subcaste_name FROM mas_caste c
    WHERE c.caste_code = ?
    ORDER BY c.subcaste_code desc`;
    return ({ query: q, params: [caste_code] });
}

exports.getMasRelationQueryParamObj = function () {
    let q = `SELECT * from mas_relation mr 
    WHERE mr.is_active = 1`;
    return ({ query: q, params: [] });
}

exports.getAllBanksQueryParamObj = function () {
    let q = `SELECT * FROM mas_bank mb
ORDER BY mb.bank_name`;;
    return ({ query: q, params: [] });
};

exports.getVillageListBySocietyQueryParamObj = function (society_id) {
    let q = `SELECT DISTINCT cast(s.Newvulocation as signed) AS 'village_code' , s.vlocationname AS 'village_name' , 
    s.vsrcensus, d.VillageID, mt.Tehsil_Name, md.District_Name,d.halka, d.halkanm
        FROM society_details_mapped s
        INNER JOIN mas_villages d ON d.vsr_census = s.Newvulocation
        INNER JOIN mas_tehsil mt ON d.distno = mt.Rev_dist_id AND d.tehsilno = mt.Rev_teh_id
        INNER JOIN mas_districts md ON md.Rev_district_id = d.distno
        WHERE s.Society_Id = ?;`;
    return ({ query: q, params: [society_id] });
};

exports.getBankBranchByDistrictAndBankQueryParamObj = function (district_id, bank_id) {
    let q = `SELECT * FROM mas_bankbranch mbb 
    WHERE mbb.branch_name <> 'OTHER STATE' AND mbb.branch_code NOT IN (152151, 155111) AND mbb.bank_code = ? AND mbb.district_id = ?
    ORDER BY mbb.branch_name`;
    return ({ query: q, params: [bank_id, district_id] });
}

exports.getSocietyListQueryParamObj = function (whereKey, district_id, tehsil_id) {
    let whereClause = ``
    if (whereKey == 1 && district_id) {
        whereClause = `WHERE s.District_Id = ${district_id}`;
    }
    else if (whereKey == 2 && district_id && tehsil_id) {
        whereClause = `WHERE s.District_Id = ${district_id} AND s.Block_Id = ${tehsil_id}`;
    }
    let q = `SELECT s.Society_Id, TRIM(s.Society_Name) as Society_Name,t.subdistrict_code  FROM society s INNER JOIN mas_tehsil t ON t.District_ID = s.District_Id AND s.Block_Id = t.Tehsil_ID ${whereClause}`;
    return ({ query: q, params: [] });
}

exports.getAllCropQueryParamObj = function (whereKey, district_id, tehsil_id) {
    let q = ` SELECT mc.crop_code,mc.crop_name FROM mas_crop mc`;
    return ({ query: q, params: [] });
}

exports.getAllVillagesOfUserId = function (user_id) {
    let q = `SELECT ofd.village_code, mv.villcdname, mv.halka FROM officer_village_details ofd
    INNER JOIN mas_villages mv ON ofd.village_code = mv.vsr_census
    where ofd.officer_code = ?`,
        p = [user_id];
    return { "query": q, "params": p };
}
exports.getAllSocietyListByBankIdQueryParam = function (bank_id) {
    let q = `SELECT s.society_id, s.Society_Name FROM mas_cooperative_bank_district mc
    INNER JOIN society s ON s.District_Id = mc.district_id
    WHERE mc.c_bank_code = ?`,
        p = [bank_id];
    return { "query": q, "params": p };
}
exports.BlockOfficerListUsingDistrictID = function (district_id) {
    let q = `SELECT
    m.name, u.user_id, u.usertype as 'user_type', u.district_id, u.subdistrict_code, 
    rv.DistrictName, rv.BlockNameEng, m.mobile_no, m.alternate_mobile_no, m.email_id, m.circle_name, m.subdistrict_code,
    rv.subdistrict_code
    FROM users u 
    INNER JOIN mas_raeo m ON m.user_id = u.user_id
    INNER JOIN mas_block rv ON rv.subdistrict_code = u.subdistrict_code
    WHERE u.usertype IN (5,15) AND u.district_id = ?
    GROUP BY u.user_id`,
        p = [district_id];
    return { "query": q, "params": p };
}
exports.getBlockByDistrictQueryParamObj = function (district_id) {
    let q = `SELECT b.BlockCode AS block_id,  b.subdistrict_code  , b.BlockNameHin AS block_name, b.BlockNameEng AS block_name_en
            FROM mas_block b
            WHERE b.district_id = ?`;
    return ({ query: q, params: [district_id] });
};
exports.getOfficerListByDistrictIdQueryParamObj = function (district_id, block, type, search) {
    let whereObj = '';
    if (search != '') {
        if (type == 1) {
            whereObj += `AND m.user_id = ${search}`
        }
        else {
            whereObj += `AND m.mobile_no = ${search}`
        }
    }
    else {
        if (block != '-1') {
            whereObj += `AND m.subdistrict_code = ${block}`
        }
    }
    let q = `SELECT m.user_id, m.name, m.mobile_no, m.alternate_mobile_no, m.subdistrict_code, m.circle_name, 
    rb.BlockNameHin AS block_name, COUNT(ov.village_code) AS village_count
    FROM mas_raeo m
    inner JOIN rev_block rb ON rb.subdistrict_code = m.subdistrict_code
    left JOIN officer_village_details ov ON ov.officer_code = m.user_id
    WHERE m.district_id = ? AND m.user_type = 6 ${whereObj}
    GROUP BY m.user_id `
    return ({ query: q, params: [+district_id] });
}

exports.getAllCOOPBanksQandP = function () {
    return ({
        query: `SELECT mcb.c_bank_code, mcb.c_bank_name, mcb.bankcode from mas_cooperative_bank mcb
        WHERE mcb.district_id IS NOT null `, params: []
    })
};
exports.getMasDivisonQueryParam = function () {
    return ({
        query: `SELECT md.div_id, md.division_name_hi, md.division_name_en 
        FROM mas_divisions md `, params: []
    })
};
exports.getSubDistrictListByDistQPObj = function (dist_LGD_Code) {
    return ({
        query: `SELECT ms.subdistrict_code, ms.subdistrict_name FROM mas_subdistricts ms
        WHERE ms.district_code = ?`, params: [+dist_LGD_Code]
    })
}
exports.getSubDistrictListByDistIdQPObj = function (dist_id) {
    return ({
        query: `SELECT ms.subdistrict_code, ms.subdistrict_name, ms.district_name FROM mas_subdistricts ms
        INNER JOIN mas_districts md ON md.LGD_Code = ms.district_code
        WHERE md.District_ID = ?`, params: [+dist_id]
    });
}